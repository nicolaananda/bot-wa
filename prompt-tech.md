# Master Prompt: bot-wa Admin Dashboard (Production-Ready, Zero-Mistake)

Single all-in-one prompt to scaffold a complete Next.js admin dashboard for the `bot-wa` Dashboard API.
Pair this with `api-kontra.md` (the API contract) when prompting.

---

## How To Use

1. Open a fresh empty folder.
2. Make sure `api-kontra.md` is accessible in the same folder (or attach it).
3. Copy everything inside the fenced block titled **PROMPT** below.
4. Paste into Claude Code / Cursor / opencode / Codex.
5. Run `pnpm install && pnpm dev`.

---

## PROMPT

````
You are a Principal-level fullstack engineer. Build a COMPLETE, PRODUCTION-READY,
ZERO-MISTAKE admin dashboard for the bot-wa Dashboard API. The API contract lives
in `api-kontra.md` (read it carefully before writing any code; treat it as the
source of truth).

OUTPUT POLICY
- Output the complete project, file by file, in a single response.
- Use fenced code blocks with file paths as block titles.
- No "// TODO", no placeholders, no "implement later", no "..." truncation.
- All files must compile and pass `tsc --noEmit`, `eslint`, and `prettier --check`.
- Stop only after writing the final file and a one-paragraph "How to Run" note.

==============================================================================
SECTION 1 — TECH STACK (NON-NEGOTIABLE)
==============================================================================
- Next.js 15 App Router + React 19 + TypeScript (strict, noUncheckedIndexedAccess)
- Tailwind CSS v4 (PostCSS plugin) + tailwind-merge + clsx
- shadcn/ui (Radix primitives) + lucide-react
- TanStack Query v5 + TanStack Table v8
- React Hook Form + Zod + @hookform/resolvers
- Recharts (primary charts) + Tremor (only for specific KPI cards if needed)
- date-fns (toleran parsing)
- sonner (toasts)
- next-themes (dark mode)
- Zustand (only for cross-component UI state, e.g., sidebar collapse)
- pnpm as package manager
- Biome OR ESLint+Prettier+prettier-plugin-tailwindcss (pick ESLint+Prettier for
  best shadcn compatibility)
- vitest + @testing-library/react for unit tests on critical helpers
- Playwright for one smoke e2e (login + open overview)

DEPENDENCIES TO INSTALL
- Runtime: next, react, react-dom, @tanstack/react-query, @tanstack/react-table,
  react-hook-form, zod, @hookform/resolvers, recharts, date-fns, sonner,
  next-themes, lucide-react, clsx, tailwind-merge, zustand, jose (JWT for
  cookie session), @t3-oss/env-nextjs (typed env)
- Dev: typescript, @types/react, @types/node, tailwindcss, postcss,
  autoprefixer, eslint, eslint-config-next, prettier, prettier-plugin-tailwindcss,
  vitest, @testing-library/react, @testing-library/jest-dom, jsdom, playwright,
  @playwright/test

DO NOT USE
- Material UI / Chakra UI / Mantine
- Redux / Redux Toolkit
- Axios (use native fetch)
- tRPC (backend is REST)
- Storybook (out of scope for v1)

==============================================================================
SECTION 2 — SECURITY (ZERO COMPROMISES)
==============================================================================
1. Token isolation
   - DASHBOARD_API_TOKEN is server-only. NEVER reach the client bundle.
   - All endpoints requiring `Authorization: Bearer ...` go through a Next.js
     proxy at `app/api/proxy/[...path]/route.ts`. Browser calls the proxy; the
     proxy attaches the bearer token from server env.
   - Reject `NEXT_PUBLIC_*` for any secret. Use `@t3-oss/env-nextjs` to enforce.

2. Auth model
   - Login form (`/login`) accepts an admin phone number + a SESSION_PASSWORD
     (env). On success, sign a JWT (HS256, 12h) using `jose` and set a cookie:
     `dash_session=<jwt>` with attributes:
       HttpOnly, Secure (in prod), SameSite=Lax, Path=/, Max-Age=43200.
   - `middleware.ts` validates the cookie on every `/dashboard/*` request and
     redirects to `/login` on failure. Returns `next()` on success.
   - Logout clears the cookie via Set-Cookie with Max-Age=0.
   - The JWT payload includes `{ adminUser: '6281389592985' | '6285235540944',
     iat, exp }`. Only ADMIN_OWNERS may log in.

3. CSRF
   - Use double-submit cookie pattern: middleware sets a `dash_csrf` cookie
     (random 32-byte hex) on first GET. All non-GET requests through the proxy
     and Server Actions require an `X-CSRF-Token` header that matches the
     cookie. Reject mismatches with 403.

4. Rate limiting
   - In-memory token bucket (60 req/min/IP) for `/api/proxy/*`. Document that
     production deployments should swap for Upstash or Redis.

5. Input validation
   - Every Server Action and Route Handler validates input with Zod before
     forwarding. Reject with 400 on failure.
   - Sanitize free-text fields displayed as HTML using DOMPurify if and only
     if HTML is needed; default to text rendering.

6. Output hardening
   - Mask sensitive fields (PIN, password) by default in the UI; click-to-reveal
     with a 10-second auto-mask timer.
   - Never log tokens, PINs, or passwords. The fetch wrapper redacts headers
     in errors.

7. Headers
   - Set strict response headers via `next.config.ts`:
     - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
     - `X-Frame-Options: DENY`
     - `X-Content-Type-Options: nosniff`
     - `Referrer-Policy: strict-origin-when-cross-origin`
     - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
     - CSP: default-src 'self'; img-src 'self' data: https:; style-src 'self'
       'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'
       https://dash.nicola.id; frame-ancestors 'none'.
       (Allow `'unsafe-inline'` ONLY because Tailwind injects style; document
       this trade-off in README.)

8. Audit
   - Every admin mutation via the proxy logs `{ adminUser, action, target,
     timestamp, ip, userAgent, status }` to a server-side log file
     `logs/audit.log` AND surfaces a toast in the UI.

9. Idempotency
   - For saldo adjustments, generate `crypto.randomUUID()` on the client,
     include in body, and disable the submit button until response arrives.

10. Error policy
    - Never expose backend stack traces to the client. Map errors to user-safe
      messages. Log the full error server-side with a correlation ID; return
      the correlation ID to the client for support tickets.

==============================================================================
SECTION 3 — UI / UX SPEC (ZERO COMPROMISES)
==============================================================================
DESIGN LANGUAGE
- Style: minimalist, dense, professional. Inspired by Vercel + Linear + shadcn
  dashboard demos.
- Color tokens (HSL via CSS variables, themed):
    background, foreground, card, card-foreground, popover, popover-foreground,
    primary (zinc-900 light / zinc-50 dark), primary-foreground,
    secondary, secondary-foreground, muted, muted-foreground,
    accent (indigo-500 / indigo-400), accent-foreground,
    destructive (red-500), destructive-foreground,
    border, input, ring, success (emerald), warning (amber), info (sky).
- Typography: `Inter` via `next/font/google` (variable font). Mono font:
  `JetBrains Mono` for IDs, code, log lines.
- Spacing scale: tailwind defaults; primary content max-width 1440px.
- Border radius: `--radius: 0.625rem`.
- Shadows: subtle (`shadow-sm`) for cards; no heavy drop shadows.
- Icons: lucide-react, 16px default in tables, 20px in nav.

LAYOUT
- App shell: collapsible sidebar (264px expanded / 64px collapsed) + topbar
  (56px). Main content area scrolls; sidebar/topbar are sticky.
- Sidebar groups:
    OVERVIEW: Overview, Realtime
    OPERATIONS: Users, Transactions, Receipts
    INVENTORY: Products, Stock, Bulk Update
    INSIGHTS: Analytics, Predictions
    SYSTEM: Audit, Logs, Settings
- Topbar: breadcrumbs (left), global search (cmd+k via cmdk), theme toggle,
  user menu (logout).
- Mobile: sidebar becomes a Sheet (Drawer) triggered by hamburger; tables
  collapse to card stacks; KPI cards become 2 columns.

INTERACTION & MOTION
- Page transitions: 150ms fade + 4px slide-in via `motion-safe:` Tailwind.
- Skeletons for every loading state (no spinners except inline buttons).
- Optimistic updates for stock add/edit/delete; rollback with toast on failure.
- All modals close on Escape and overlay click; restore focus to trigger.
- Confirm dialogs for destructive actions; require typing the resource name
  for product delete.

ACCESSIBILITY (WCAG AA)
- Focus visible on every interactive element (`:focus-visible` ring).
- All form fields have `<Label htmlFor>` + `aria-describedby` for errors.
- Tables: `<caption>`, `scope="col"`, keyboard sortable headers.
- Color contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI elements.
- All icons that convey meaning have `aria-label`; decorative icons
  `aria-hidden="true"`.
- Semantic HTML (`<nav>`, `<main>`, `<header>`, `<aside>`).
- Skip-to-content link at the top.
- Respect `prefers-reduced-motion`.

EMPTY / LOADING / ERROR STATES
- Empty: friendly illustration placeholder (lucide icon + heading + helper
  text + primary action).
- Loading: skeletons matching final layout; never blank screens.
- Error: inline alert with retry button + correlation ID.

DENSITY
- Default table row height 40px. User-toggle for "comfortable" (48px) and
  "compact" (32px). Persist to localStorage.

COMPONENTS TO BUILD (under `components/ui` use shadcn primitives + custom)
- DataTable<T> (TanStack-driven, server-side pagination/sort/filter,
  column visibility menu, density toggle, CSV export of current page).
- KPICard (label, value, delta, sparkline optional).
- StatusBadge (in_stock/low/out, role bronze/silver/gold/admin, success/warn/error).
- AmountDisplay (formats IDR with thousand separators).
- DateDisplay (relative + absolute via Tooltip, tolerant parser).
- MaskedField (auto-mask after 10s reveal).
- ConfirmDialog (typed-name confirmation for destructive ops).
- CommandPalette (cmd+k, jumps to pages and resources).
- ChartCard (wraps Recharts with title, description, legend, empty state).
- Sparkline (mini line for KPI cards).
- StockItemEditor (parses email|password|profile|pin|notes; validates).
- BulkPasteTextarea (counts lines, shows valid/invalid count, highlights bad
  rows).
- IdempotencyButton (auto-generates key, disables on submit).

==============================================================================
SECTION 4 — PROJECT STRUCTURE
==============================================================================
.
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── overview/{page,loading,error}.tsx
│   │   ├── realtime/{page,loading,error}.tsx
│   │   ├── users/{page,loading,error}.tsx
│   │   ├── users/[userId]/{page,loading,error}.tsx
│   │   ├── transactions/{page,loading,error}.tsx
│   │   ├── transactions/[reffId]/{page,loading,error}.tsx
│   │   ├── products/{page,loading,error}.tsx
│   │   ├── products/new/page.tsx
│   │   ├── products/[productId]/{page,loading,error}.tsx
│   │   ├── products/[productId]/stock/page.tsx
│   │   ├── stock/{page,loading,error}.tsx
│   │   ├── stock/bulk/page.tsx
│   │   ├── analytics/{page,loading,error}.tsx
│   │   ├── receipts/{page,loading,error}.tsx
│   │   ├── audit/{page,loading,error}.tsx
│   │   ├── logs/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── auth/login/route.ts
│   │   ├── auth/logout/route.ts
│   │   └── proxy/[...path]/route.ts
│   ├── layout.tsx
│   ├── not-found.tsx
│   └── globals.css
├── components/
│   ├── ui/                # shadcn-generated + custom
│   ├── layout/{sidebar,topbar,user-menu,theme-toggle,mobile-sheet}.tsx
│   ├── data-table/{data-table,column-header,pagination,toolbar,density-toggle}.tsx
│   ├── charts/{area,bar,line,donut,heatmap,sparkline}.tsx
│   ├── kpi-card.tsx
│   ├── status-badge.tsx
│   ├── amount-display.tsx
│   ├── date-display.tsx
│   ├── masked-field.tsx
│   ├── confirm-dialog.tsx
│   ├── command-palette.tsx
│   ├── stock-item-editor.tsx
│   ├── bulk-paste-textarea.tsx
│   └── idempotency-button.tsx
├── lib/
│   ├── api/{client.ts,server.ts,endpoints.ts,types.ts,errors.ts}
│   ├── auth/{session.ts,csrf.ts,middleware.ts}
│   ├── hooks/                # TanStack Query hooks per domain
│   │   ├── use-overview.ts
│   │   ├── use-users.ts
│   │   ├── use-user-detail.ts
│   │   ├── use-transactions.ts
│   │   ├── use-products.ts
│   │   ├── use-stock.ts
│   │   ├── use-analytics.ts
│   │   ├── use-receipts.ts
│   │   ├── use-audit.ts
│   │   ├── use-realtime.ts
│   │   └── use-sse-logs.ts
│   ├── utils/
│   │   ├── cn.ts
│   │   ├── format-currency.ts
│   │   ├── format-date.ts          # tolerant parser
│   │   ├── parse-stock-item.ts
│   │   ├── validate-stock-item.ts
│   │   ├── strip-wa-suffix.ts
│   │   ├── rate-limit.ts
│   │   └── redact.ts
│   ├── validators/                 # Zod schemas (one per domain)
│   └── constants.ts
├── config/
│   ├── env.ts                      # @t3-oss/env-nextjs
│   ├── nav.ts                      # sidebar groups
│   └── site.ts
├── tests/
│   ├── unit/format-date.test.ts
│   ├── unit/parse-stock-item.test.ts
│   ├── unit/validate-stock-item.test.ts
│   └── e2e/login.spec.ts
├── public/
│   └── favicon.svg
├── middleware.ts
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                 # shadcn config
├── tsconfig.json
├── eslint.config.mjs
├── .prettierrc
├── package.json
├── pnpm-workspace.yaml             # not needed unless monorepo; skip
├── .env.example
├── .gitignore
└── README.md

==============================================================================
SECTION 5 — ENVIRONMENT VARIABLES (.env.example)
==============================================================================
# Public (safe in browser)
NEXT_PUBLIC_APP_NAME="bot-wa Dashboard"
NEXT_PUBLIC_API_BASE_PUBLIC=https://dash.nicola.id

# Server-only (never expose)
DASHBOARD_API_BASE=https://dash.nicola.id
DASHBOARD_API_TOKEN=__set_me__
ADMIN_OWNERS=6281389592985,6285235540944
SESSION_PASSWORD=__min_24_chars__
SESSION_SECRET=__min_32_bytes_hex__
SESSION_TTL_SECONDS=43200
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
NODE_ENV=development

Validation: `config/env.ts` uses `createEnv` from `@t3-oss/env-nextjs` to enforce
types and required fields. Crash on boot if invalid.

==============================================================================
SECTION 6 — API LAYER
==============================================================================
1. `lib/api/types.ts`
   - Mirror every type defined in section 12 of `api-kontra.md` PLUS expand
     for fields used by the UI (e.g., `Pagination` with `total`, `currentPage`,
     `totalPages`, `hasNextPage`, `hasPrevPage`, `usersPerPage`).
   - Define `ApiResponse<T>` envelope.

2. `lib/api/errors.ts`
   - `class ApiError extends Error` with `status`, `code`, `correlationId`.
   - Maps backend strings (e.g. "PostgreSQL mode is required") to friendly
     messages.

3. `lib/api/client.ts` (browser-safe; only public reads)
   - `request<T>(path, init?)` calls `NEXT_PUBLIC_API_BASE_PUBLIC` directly.
   - Throws `ApiError` on `!ok || !json.success`.
   - Reads both `error` and `message` per contract.

4. `lib/api/server.ts` (server-only; throws if used in browser)
   - Used by Server Actions and the proxy.
   - Auto-attaches `Authorization: Bearer <DASHBOARD_API_TOKEN>` and
     `X-Admin-User: <admin from session>`.
   - Adds correlation ID via `X-Correlation-Id` header.

5. `app/api/proxy/[...path]/route.ts`
   - Methods: GET, POST, PUT, PATCH, DELETE.
   - Validates session cookie + CSRF for non-GET.
   - Validates allowlist of paths (regex per group: dashboard, admin, webhook
     test endpoints) — reject any other path with 404.
   - Forwards to `DASHBOARD_API_BASE` with bearer + admin headers.
   - Streams responses for endpoints returning CSV / SSE / large bodies.
   - Logs every request to `logs/proxy.log` (correlationId, status, duration).

6. `lib/api/endpoints.ts`
   - One typed function per endpoint listed in `api-kontra.md`.
   - Browser-callable functions hit `/api/proxy/...`; server-only functions
     hit `lib/api/server.ts` directly. Mark each clearly.

==============================================================================
SECTION 7 — PAGES (FUNCTIONAL SPEC)
==============================================================================
[/login]
- Centered card. Phone input (digits only) + password input + "Sign in".
- On submit → POST /api/auth/login (Zod-validated). Verifies phone is in
  ADMIN_OWNERS and password matches SESSION_PASSWORD (constant-time compare).
  Sets cookie, sets CSRF cookie, redirects to /dashboard/overview.
- Show inline alert on failure. Disable form during submit.

[/dashboard/overview]
- 4 KPI cards (Total Users, Total Transactions, Total Revenue, Total Profit).
- Area chart: revenue last 30 days (daily) from /finance/analytics.
- Bar chart: top 10 products by revenue from /products/performance.
- Donut: payment method distribution from /analytics/advanced.
- Recent transactions table (top 10).
- Auto-refetch every 30s.

[/dashboard/realtime]
- Live KPIs: today's revenue, today's transactions, active users (7d).
- Bar chart: 24-hour activity heatmap.
- Recent stream (top 10 live).
- React Query refetchInterval = 15s.
- Show "last updated Xs ago" indicator.

[/dashboard/users]
- DataTable with server-side pagination, search, role filter.
- Use /api/admin/users (preferred) when session has owner; fallback to
  /api/dashboard/users/all for non-mutating list view.
- Columns: Phone (stripped), Username, Saldo, Role, Active, Last Activity,
  Total Spent, Actions menu.
- Actions:
  • View Detail → /users/[userId]
  • Adjust Saldo: modal with amount, reason, idempotency key (auto), preview
    before/after. Calls PATCH /api/admin/users/:userId/saldo.
  • Change Role: select bronze/silver/gold/admin (admin only for owner).
  • Set PIN: 4-6 digit input, masked, confirms twice.

[/dashboard/users/[userId]]
- Tabs: Profile · Transactions · Saldo History · Behavior.
- Profile: KPI cards + raw fields.
- Transactions: table from /dashboard/users/:userId/transactions.
- Saldo History: table from /dashboard/users/:userId/saldo/history with
  filters action/method/source/search.
- Behavior: charts derived from /dashboard/users/behavior filtered to user.

[/dashboard/transactions]
- Search bar by reffId; recent transactions table with limit selector
  (10/20/50/100). Click row → /transactions/[reffId].

[/dashboard/transactions/[reffId]]
- Detail card from /transactions/search/:reffId.
- Delivered Account panel (if exists) with masked password + copy buttons.
- Receipt panel: monospace render + Download.
- Profit display.

[/dashboard/products]
- View toggle: cards / table.
- Filter: category, stock status (in/low/out).
- Each card: name, prices B/S/G, stock count + status badge, utilization bar,
  terjual.
- Actions: View, Edit, Delete (typed-name confirm), Manage Stock.

[/dashboard/products/new]
- Form with Zod (id regex ^[a-zA-Z0-9_-]+$, name required, prices ≥ 0,
  minStock ≥ 0). Submit → POST /api/dashboard/products. Redirect on success.

[/dashboard/products/[productId]]
- Edit form prefilled. Sales summary block. Link to stock manager.

[/dashboard/products/[productId]/stock]
- Stock items table (index, email, password [masked], profile, pin, notes,
  actions edit/delete/move).
- Add Single Item form (Zod-validated).
- Add Batch via BulkPasteTextarea (one per line; format:
  email|password|profile|pin|notes; shows valid/invalid line count).
- Restock from CSV upload (parses CSV, calls bulk endpoint).
- All operations optimistic; rollback on error; toast on success.

[/dashboard/stock]
- KPIs: total products, total items, low stock, out of stock.
- Alerts panel from /products/stock/alerts (urgency-sorted).
- Donut: stock by category.
- Buttons: Export CSV, Bulk Update.

[/dashboard/stock/bulk]
- Multi-row form (productId combobox + action add/remove + stockItems textarea
  + notes). Add/remove rows dynamically.
- Submit → POST /products/stock/bulk-update.
- Result table per row (success/error) below the form.

[/dashboard/analytics]
- Tabs: Advanced · Finance · Predictions.
- Advanced: monthly trend, hourly heatmap, role pie, top products.
- Finance: daily revenue/profit area, payment donut, profit margin gauge,
  recommendations list.
- Predictions: predicted next month revenue card, churn risk table,
  stock prediction table, recommendations.

[/dashboard/receipts]
- DataTable from /receipts. Row click → modal with content.
- Actions: Download, Delete (confirm).

[/dashboard/audit]
- DataTable from /api/admin/audit with filters (admin, userId, action,
  dateFrom, dateTo). Client-side CSV export of current view.

[/dashboard/logs]
- SSE stream from /logs/sse via EventSource.
- Newest line auto-prepended; cap 1000 in DOM.
- Pause / Resume / Clear / Filter (regex highlight).
- Auto-reconnect on disconnect (exponential backoff up to 30s).

[/dashboard/settings]
- Theme: light/dark/system.
- Density: compact/default/comfortable.
- API base display (read-only).
- "Health Check" button → calls /webhook/midtrans/test, shows result.
- "Sign Out" button.

[/]
- Redirect to /dashboard/overview if logged in else /login.

[/not-found]
- 404 with link to /dashboard/overview.

==============================================================================
SECTION 8 — STATE & DATA RULES
==============================================================================
- All async via TanStack Query. No raw useEffect+fetch except SSE.
- Query keys: `['domain', 'op', ...params]`, e.g. `['users','list',{page,role}]`.
- Use `queryClient.invalidateQueries({queryKey:['users']})` after mutations.
- Optimistic updates for stock CRUD; rollback on `onError`.
- Default `staleTime: 30_000`, `gcTime: 5*60_000`.
- Refetch on window focus only on overview/realtime; disable elsewhere.
- Use `placeholderData: keepPreviousData` for paginated tables to avoid jank.

==============================================================================
SECTION 9 — UTILITIES
==============================================================================
- `format-currency.ts`: `Intl.NumberFormat('id-ID', { style:'currency',
  currency:'IDR', maximumFractionDigits:0 })`. Export both `formatIDR(n)` and
  `formatIDRShort(n)` (e.g., 1.2 jt, 950 rb).
- `format-date.ts`: tolerant parser. Try `parseISO` first; if NaN, try
  `parse(s, 'yyyy-MM-dd HH:mm:ss', new Date())`; finally `new Date(s)`.
  Export `formatDate(s, 'absolute' | 'relative' | 'datetime')`.
- `parse-stock-item.ts` / `validate-stock-item.ts`: split by `|`, require ≥4
  segments. Email shape optional but validated when present.
- `strip-wa-suffix.ts`: removes `@s.whatsapp.net`.
- `redact.ts`: redacts `Authorization`, `X-Admin-User`, `pin`, `password` in
  logged objects.

==============================================================================
SECTION 10 — TESTS
==============================================================================
- Unit (vitest):
  • format-date.test.ts — covers ISO, "yyyy-MM-dd HH:mm:ss", invalid.
  • parse-stock-item.test.ts — valid, missing notes, malformed.
  • validate-stock-item.test.ts — true/false cases.
- E2E (playwright):
  • login.spec.ts — login form rejects bad creds; accepts valid; reaches
    /dashboard/overview.

==============================================================================
SECTION 11 — README
==============================================================================
Write a complete README covering:
- Stack overview & rationale (1 paragraph).
- Setup: pnpm install, copy .env.example, fill values, pnpm dev.
- Scripts: dev, build, start, lint, typecheck, test, test:e2e.
- Deployment: Vercel (recommended) and Docker (Dockerfile included? — yes:
  produce a multi-stage Dockerfile with `output:'standalone'`).
- Security notes: how token isolation works; CSP trade-offs; rate limiting
  is in-memory and SHOULD be replaced for prod.
- Backend caveats: USE_PG mode requirement; some analytics only work in JSON
  mode; tolerant date parsing required.

==============================================================================
SECTION 12 — ACCEPTANCE CHECKLIST (must all pass before stopping)
==============================================================================
[ ] `pnpm install` succeeds.
[ ] `pnpm typecheck` passes (tsc --noEmit, strict).
[ ] `pnpm lint` passes (zero errors, zero warnings).
[ ] `pnpm test` passes (vitest).
[ ] `pnpm build` produces a valid `.next` output.
[ ] `pnpm test:e2e` passes (playwright login smoke).
[ ] DASHBOARD_API_TOKEN does NOT appear in `.next/static/**` (verify with grep).
[ ] All tables: pagination + sort + filter + density toggle + CSV export work.
[ ] Stock manager: add single, add batch, edit, delete, bulk update all work
     end-to-end against the live backend (assumed reachable at
     DASHBOARD_API_BASE) with optimistic UI.
[ ] Saldo adjustment uses idempotency key; double-clicking the submit button
     does not double-charge.
[ ] SSE log viewer auto-reconnects within 5s on disconnect.
[ ] Dark mode + density preferences persist via localStorage.
[ ] Mobile (375px width): nav becomes Sheet; tables become cards; KPI cards
     2-up.
[ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95 on /dashboard/overview.
[ ] Keyboard-only navigation works for every interactive element; focus
     visible.
[ ] No `any` types except in narrowly justified utility helpers.
[ ] All Server Actions and Route Handlers Zod-validate inputs.
[ ] Response headers (CSP, HSTS, etc.) verified via curl in README example.

==============================================================================
SECTION 13 — IMPLEMENTATION ORDER (FOLLOW EXACTLY)
==============================================================================
1. package.json + tsconfig.json + next.config.ts + tailwind.config.ts +
   postcss.config.mjs + eslint.config.mjs + .prettierrc + .gitignore +
   .env.example + components.json + middleware.ts.
2. config/env.ts, config/site.ts, config/nav.ts.
3. app/globals.css + app/layout.tsx (providers: theme, query, toaster).
4. lib/utils/* (cn, format-currency, format-date, parse/validate-stock-item,
   strip-wa-suffix, redact, rate-limit).
5. lib/api/{types,errors,client,server,endpoints}.ts.
6. lib/auth/{session,csrf}.ts.
7. middleware.ts (auth + CSRF + rate limit on /api/proxy).
8. app/api/auth/login + logout route handlers.
9. app/api/proxy/[...path]/route.ts.
10. components/ui (shadcn primitives) + custom components.
11. components/layout/* (sidebar, topbar, theme-toggle, command-palette).
12. components/data-table/* + components/charts/*.
13. lib/hooks/* (one per domain).
14. lib/validators/* (Zod schemas).
15. App pages in this exact order:
    /login → /dashboard/overview → /dashboard/realtime → /dashboard/users →
    /dashboard/users/[userId] → /dashboard/transactions →
    /dashboard/transactions/[reffId] → /dashboard/products →
    /dashboard/products/new → /dashboard/products/[productId] →
    /dashboard/products/[productId]/stock → /dashboard/stock →
    /dashboard/stock/bulk → /dashboard/analytics → /dashboard/receipts →
    /dashboard/audit → /dashboard/logs → /dashboard/settings →
    app/not-found.tsx.
16. tests/unit/* + tests/e2e/login.spec.ts.
17. Dockerfile + README.md.

==============================================================================
SECTION 14 — RULES OF ENGAGEMENT
==============================================================================
- If `api-kontra.md` is unclear, re-read the relevant section before guessing.
  Document any assumption inline as a comment with `// ASSUMPTION:`.
- Never invent endpoints not present in `api-kontra.md`.
- If the backend returns "PostgreSQL mode is required", surface a friendly
  toast and disable the related feature.
- Use functional React only (no class components).
- Prefer Server Components by default; use `"use client"` only where required
  (forms, hooks, charts, anything stateful).
- Keep components < 200 lines; extract subcomponents.
- One concept per file; co-locate component-specific styles with the component.
- Commit messages aren't required; just produce the code.

==============================================================================
BEGIN
==============================================================================
Read `api-kontra.md` first. Then output every file listed in Section 4 in the
exact order from Section 13. End with the README and a one-paragraph "How to
Run" note.
````

---

## Notes

- This single prompt is self-contained: stack, security model, UI/UX spec, file structure, environment, API layer, pages, tests, README, deployment, and an acceptance checklist.
- Pair it with `api-kontra.md` so the assistant can reference the exact endpoints and shapes.
- If the assistant exceeds output limits, ask it to "continue exactly where it stopped, no recap" — the implementation order in Section 13 makes resuming deterministic.
- For best results, run with a model that has long output (Claude Opus / Sonnet 4.5+, GPT-5, Gemini 2.5 Pro). Smaller models will need to be guided file-by-file using the same order.
