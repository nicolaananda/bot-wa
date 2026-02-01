# Fix Git Pull di Server

## Masalah
```
fatal: Need to specify how to reconcile divergent branches.
```

Ini terjadi karena ada force push yang membuat branch lokal dan remote berbeda.

## Solusi

Jalankan command berikut di server:

```bash
cd ~/bot/bot-wa

# Reset hard ke origin/main (sinkronkan dengan remote)
git fetch origin
git reset --hard origin/main

# Atau jika ingin merge (jaga perubahan lokal jika ada)
git fetch origin
git pull origin main --rebase
```

## Opsi 1: Reset Hard (Recommended)
Ini akan menghapus semua perubahan lokal dan sinkronkan dengan remote:

```bash
git fetch origin
git reset --hard origin/main
```

## Opsi 2: Set Pull Strategy
Jika ingin set default behavior untuk pull:

```bash
# Untuk merge (default)
git config pull.rebase false

# Untuk rebase
git config pull.rebase true

# Untuk fast-forward only
git config pull.ff only
```

Kemudian pull:
```bash
git pull
```

## Opsi 3: Force Pull dengan Rebase
```bash
git fetch origin
git pull origin main --rebase
```

## Setelah Fix
Pastikan status sudah clean:
```bash
git status
```

Harus menunjukkan:
```
On branch main
Your branch is up to date with 'origin/main'.
```

