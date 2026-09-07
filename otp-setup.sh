#!/usr/bin/env bash
set -euo pipefail

# Run with bash; resolve dependencies and .env relative to this script, not the caller.
exec node - "$0" "$@" <<'NODE'
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { spawnSync } = require('node:child_process')
const root = path.dirname(path.resolve(process.argv[2]))
const localRequire = createRequire(path.join(root, 'package.json'))
const args = process.argv.slice(3)
const usage = 'Usage: bash otp-setup.sh --apply --writers-stopped /absolute/existing/backup-directory\nOffline check: bash otp-setup.sh --self-test'

function otpSql(schema) {
  const start = schema.indexOf('CREATE TABLE IF NOT EXISTS otp_orders (')
  const end = schema.indexOf('CREATE TABLE IF NOT EXISTS transaksi (', start)
  if (start < 0 || end < 0) throw Error('OTP schema boundaries missing; inspect options/schema.sql.')
  const sql = schema.slice(start, end).trim()
  if (
    !sql.endsWith('FOR EACH ROW EXECUTE PROCEDURE protect_otp_wallet_debit();') ||
    !sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uniq_otp_orders_active_user') ||
    /\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE|ALTER\s+TABLE)\b/i.test(sql)
  ) throw Error('Unexpected OTP migration content; manual review required.')
  return sql
}

async function main() {
  if (!args.length || args[0] === '--help') {
    console.log(usage)
    return
  }
  const sql = otpSql(fs.readFileSync(path.join(root, 'options/schema.sql'), 'utf8'))
  if (args.length === 1 && args[0] === '--self-test') {
    const assert = require('node:assert/strict')
    assert.ok(sql.startsWith('CREATE TABLE IF NOT EXISTS otp_orders ('))
    assert.doesNotMatch(sql, /\b(?:transaksi|midtrans_webhooks|web_pos_pin)\b/)
    assert.throws(() => otpSql(''), /boundaries/)
    assert.throws(() => otpSql(sql + '\nDELETE FROM users;\nCREATE TABLE IF NOT EXISTS transaksi ('), /content/)
    assert.throws(() => otpSql(sql.replace('CREATE UNIQUE INDEX', 'CREATE INDEX') + '\nCREATE TABLE IF NOT EXISTS transaksi ('), /content/)
    console.log('OTP setup offline checks passed. No configuration, database, or network loaded.')
    return
  }
  if (args.length !== 3 || args[0] !== '--apply' || args[1] !== '--writers-stopped')
    throw Error(usage)
  const directory = args[2]
  if (!path.isAbsolute(directory) || !fs.statSync(directory).isDirectory())
    throw Error('Backup directory must be an existing absolute directory.')

  localRequire('dotenv').config({ path: path.join(root, '.env'), quiet: true })
  if (String(process.env.USE_PG).toLowerCase() !== 'true') throw Error('Set USE_PG=true first.')
  for (const binary of ['pg_dump', 'pg_restore']) {
    if (spawnSync(binary, ['--version'], { stdio: 'ignore', timeout: 10000 }).status !== 0)
      throw Error(`Install PostgreSQL client tools: ${binary} is unavailable.`)
  }
  const config = {
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'bot_wa',
    user: process.env.PG_USER || 'bot_wa',
    password: process.env.PG_PASSWORD || 'bot_wa',
    ssl: String(process.env.PG_SSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
  }
  // Do not import config/postgres: its warmup and write retries are inappropriate for migration.
  const { Client } = localRequire('pg')
  const client = new Client(config)
  let stage = 'connecting'
  try {
    await client.connect()
    stage = 'checking and locking schema'
    await client.query('BEGIN')
    await client.query("SET LOCAL search_path = public, pg_catalog")
    await client.query("SET LOCAL lock_timeout = '5s'")
    const lock = await client.query("SELECT pg_try_advisory_xact_lock(73415, 1) AS locked")
    if (!lock.rows[0].locked) throw Error('Another OTP setup is running.')
    await client.query('LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE')
    const existing = await client.query(`SELECT
      to_regclass('public.otp_orders') AS orders,
      to_regclass('public.uniq_otp_orders_active_user') AS active_index,
      to_regprocedure('public.protect_otp_wallet_debit()') AS function,
      EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.users'::regclass
        AND tgname='users_otp_wallet_debit') AS trigger`)
    if (Object.values(existing.rows[0]).some(Boolean))
      throw Error('OTP objects already exist. Inspect the existing installation; nothing was changed.')
    const legacy = await client.query("SELECT 1 FROM public.users WHERE user_id ~ '^[0-9]+$' LIMIT 1")
    if (legacy.rowCount) throw Error('Bare-number wallet records exist. Reconcile them before setup; do not sum balances blindly.')

    stage = 'creating backup'
    const backup = path.join(directory, `otp-before-${Date.now()}-${process.pid}.dump`)
    const fd = fs.openSync(backup, 'wx', 0o600)
    console.log(`Backup: ${backup}`)
    let dump
    try {
      dump = spawnSync('pg_dump', [
        '--format=custom', '--no-password', '--host', config.host, '--port', String(config.port),
        '--username', config.user, '--dbname', config.database,
      ], {
        env: { ...process.env, PGPASSWORD: config.password, PGSSLMODE: config.ssl ? 'require' : 'disable', PGCONNECT_TIMEOUT: '15' },
        stdio: ['ignore', fd, 'pipe'], timeout: 300000,
      })
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    if (dump.status !== 0) throw Error('pg_dump failed. Backup may be incomplete; migration was not applied.')
    if (spawnSync('pg_restore', ['--list', backup], { stdio: 'ignore', timeout: 30000 }).status !== 0)
      throw Error('Backup archive validation failed; migration was not applied.')

    stage = 'applying OTP-only migration'
    await client.query(sql)
    stage = 'committing migration'
    await client.query('COMMIT')
    console.log('OTP migration committed. No balances were modified. PM2 was not restarted.')
    console.log('Set a fresh OTPCEPAT_API_KEY, then restart the bot: pm2 restart 1 --update-env')
    console.log('Check #getBalance in owner private chat. Archive listing is not a restore test; retain and test the backup.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    // Never print driver errors: connection details or secrets may appear in them.
    if (error.code || stage === 'connecting' || stage === 'committing migration') {
      throw Error(`OTP setup failed while ${stage}. Keep writers stopped and inspect database state before retrying.`)
    }
    throw error
  } finally {
    await client.end().catch(() => {})
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
NODE
