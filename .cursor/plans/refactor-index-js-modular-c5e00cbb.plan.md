<!-- c5e00cbb-a138-443d-a522-b7a80248dab7 e0a902cd-8c02-4814-bf36-c3f29ec3a5c8 -->
# Refactor index.js ke Struktur Modular

## Overview

Refactor file `index.js` (8,404 baris) menjadi struktur modular yang terorganisir dengan baik, memisahkan concerns, mengelompokkan commands berdasarkan kategori, dan memisahkan ke dalam layers yang berbeda.

## Target Structure

```
src/
├── handlers/           # Command handlers by category
│   ├── admin.js       # Owner commands (testmsg, resendakun, addproduk, etc)
│   ├── menu.js        # Menu commands (menu, allmenu, groupmenu, etc)
│   ├── payment.js     # Payment/deposit (payment, addsaldo, minsaldo, accdepo)
│   ├── topup.js       # Topup commands (tp, ml, ff, pubg, genshin, etc)
│   ├── store.js       # Store management (stok, listharga, bukti)
│   ├── user.js        # User commands (saldo, riwayat, statistik, cari)
│   ├── group.js       # Group admin commands (antilink, setppgc, etc)
│   └── index.js       # Handler aggregator
├── middleware/
│   ├── auth.js        # isOwner, isAdmin checks
│   ├── session.js     # Session handlers (topup, deposit flows)
│   ├── autoresponder.js # Auto-response (responList, responTesti, antilink)
│   └── index.js       # Middleware aggregator
├── services/
│   ├── payment.js     # Payment gateway logic (Midtrans, QRIS, etc)
│   ├── product.js     # Product management
│   ├── transaction.js # Transaction management
│   ├── database.js    # Database operations wrapper
│   └── stalker.js     # Game stalker functions (already exists in function/)
├── utils/
│   ├── formatters.js  # toRupiah, Styles, wrapText
│   ├── message.js     # reply, Reply, parseMention, getThumbnailBuffer
│   ├── profit.js      # hargaSetelahProfit, hargaProduk
│   ├── invoice.js     # generateInvoiceWithBackground, digit
│   ├── qris.js        # QRIS dynamic generation
│   ├── cache.js       # saldo cache management
│   └── constants.js   # Global constants
├── config/
│   └── index.js       # Centralized config loader
└── index.js           # Main message handler (orchestrator)
```

## Key Files to Extract

### 1. **Utils Functions** (Lines 97-425)

- `getCachedSaldo`, `setCachedSaldo`, `clearExpiredCache` → `utils/cache.js`
- `parseMention`, `reply`, `Reply`, `getThumbnailBuffer` → `utils/message.js`
- `toRupiah`, `toRupiahLocal`, `Styles` → `utils/formatters.js`
- `hargaSetelahProfit`, `hargaProduk` → `utils/profit.js`
- `generateInvoiceWithBackground`, `digit` → `utils/invoice.js`
- `generateDynamicQrisFromStatic`, `crc16ccitt`, `tlv` → `utils/qris.js`

### 2. **Middleware** (Lines 428-1055)

- Topup session handler (lines 428-995) → `middleware/session.js` (topup flow)
- Deposit session handler (lines 996-1006) → `middleware/session.js` (deposit flow)
- Auto-responders (lines 1008-1024) → `middleware/autoresponder.js`
- Antilink logic (lines 1026-1051) → `middleware/autoresponder.js`

### 3. **Command Handlers** (Lines 1057-8400)

**Admin Commands** → `handlers/admin.js`

- testmsg, resendakun, addproduk, delproduk, setharga, setjudul, setdesk, setsnk, setprofit, setkode, addstok, delstok, ubahrole, accdepo, rejectdepo, addsaldo, minsaldo

**Menu Commands** → `handlers/menu.js`

- menu, allmenu, groupmenu, infobot, ownermenu, stalkermenu, storemenu, topupmenu, ordermenu

**Payment Commands** → `handlers/payment.js`

- payment, accdepo, rejectdepo, ceksaldo/saldo, addsaldo, minsaldo

**Topup Commands** → `handlers/topup.js`

- tp, isi, ml, ff, pubg, hok, aov, pointblank, lordsmobile, valorant, genshin (and all other game topups)

**Store Commands** → `handlers/store.js`

- stok/stock, listharga, bukti, addproduk, delproduk, setharga, setjudul, setdesk, setsnk

**User Commands** → `handlers/user.js`

- saldo/ceksaldo, riwayat, statistik, cari, export, dashboard, rekap, batal

**Group Commands** → `handlers/group.js`

- setppgc, backup (and any group-related commands)

### 4. **Services Layer**

- Payment gateway operations → `services/payment.js`
- Product CRUD → `services/product.js`
- Transaction management → `services/transaction.js`
- Database wrapper → `services/database.js`

### 5. **Main Handler** → `index.js` (refactored)

- Import dependencies
- Initialize context
- Run middleware
- Route to appropriate handler
- Error handling

## Implementation Steps

1. Create directory structure (`src/handlers`, `src/middleware`, `src/services`, `src/utils`)
2. Extract utility functions first (no dependencies on context)
3. Extract middleware (session handlers, auto-responders)
4. Extract command handlers by category
5. Create handler aggregator (`src/handlers/index.js`)
6. Refactor main `index.js` to orchestrate the flow
7. Update imports in existing files that depend on functions
8. Test to ensure functionality is preserved

## Critical Requirements

⚠️ **PENTING - SEMUA KODE HARUS DIPERTAHANKAN**:

- ✅ **NO CODE DELETION**: Semua kode dari index.js akan dipindahkan, TIDAK ADA yang dihapus
- ✅ **ALL CASES PRESERVED**: Semua case commands (100+ cases) akan dipindahkan lengkap ke handlers
- ✅ **FUNCTIONALITY INTACT**: Setiap fungsi tetap bekerja persis seperti sebelumnya
- ✅ **VERIFICATION STEPS**: Setiap ekstraksi akan diverifikasi untuk memastikan tidak ada kode yang hilang

## Notes

- **Conservative approach**: Extract and organize code as-is, ZERO logic changes
- **Maintain backward compatibility**: Existing function signatures stay the same
- **Context passing**: Pass `{ ronzz, m, mek, db, ...helpers }` as context object to handlers
- **Error handling**: Preserve existing try-catch blocks exactly as-is
- **Line-by-line migration**: Every line from index.js will be accounted for in the new structure
- **Testing after each module**: Verify code compiles and runs after each extraction
- **Documentation**: Add JSDoc comments to exported functions explaining purpose and parameters

### To-dos

- [ ] Create directory structure (src/handlers, middleware, services, utils)
- [ ] Extract utility functions (formatters, message, profit, invoice, qris, cache, constants)
- [ ] Extract middleware (session handlers, autoresponders, auth checks)
- [ ] Extract menu command handlers to handlers/menu.js
- [ ] Extract admin command handlers to handlers/admin.js
- [ ] Extract payment command handlers to handlers/payment.js
- [ ] Extract topup command handlers to handlers/topup.js
- [ ] Extract store command handlers to handlers/store.js
- [ ] Extract user command handlers to handlers/user.js
- [ ] Extract group command handlers to handlers/group.js
- [ ] Create handler aggregator (src/handlers/index.js) to export all handlers
- [ ] Create service layer (payment, product, transaction, database wrappers)
- [ ] Refactor main index.js to orchestrate the flow using extracted modules
- [ ] Update any external files that import functions from index.js
- [ ] Test critical flows to ensure functionality is preserved