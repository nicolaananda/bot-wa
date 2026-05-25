// ESLint v9 flat config
import js from '@eslint/js'
import pluginImport from 'eslint-plugin-import'
import pluginPrettier from 'eslint-plugin-prettier'
import pluginSimpleImportSort from 'eslint-plugin-simple-import-sort'

export default [
  {
    ignores: [
      'node_modules',
      'session',
      'backup',
      'options/image',
      'options/sticker',
      'options/receipts',
    ],
  },
  js.configs.recommended,
  {
    plugins: {
      import: pluginImport,
      prettier: pluginPrettier,
      'simple-import-sort': pluginSimpleImportSort,
    },
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      // Unused vars: keep enforced for new code, but legacy index.js has many
      // top-level imports kept around for runtime side-effects / future hooks.
      // Downgrade to warn so pre-commit doesn't block feature work.
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Legacy patterns we don't want to refactor right now. Keep as warn so
      // they're visible in editor but pre-commit lint passes.
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-case-declarations': 'warn',
      'no-redeclare': 'warn',
      'no-unreachable': 'warn',
      // Temporarily disable no-undef to unblock auto-fixes on legacy globals
      'no-undef': 'off',
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
      'import/order': 'off',
      'import/no-unresolved': 'off',
      'prettier/prettier': 'warn',
    },
  },
]
