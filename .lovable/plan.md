

## Plan: Shopify Orders in Sidebar + AI Context

### Part 1 — Shopify Orders in CustomerInfoSidebar

**File: `src/components/helpdesk/CustomerInfoSidebar.tsx`**

- Add `useState` + `useEffect` to call `get-shopify-customer-orders` when `ticket.id` changes
- Track `orders`, `loading`, `notConfigured` state
- After the existing "Ticket criado" section, add a new `Separator` + "Pedidos Shopify" section:
  - Loading: `Skeleton` loaders
  - `notConfigured`: subtle muted text "Integração Shopify não configurada"
  - Empty orders: "Nenhum pedido encontrado"
  - Orders list: card per order with:
    - `#{order_number}` + `Badge` (unfulfilled=yellow, fulfilled=green, cancelled=red)
    - Items list: name + variant + quantity
    - Total price + financial_status badge
    - Tracking link if available (clickable `tracking_url`)
- Uses `supabase.functions.invoke('get-shopify-customer-orders', { body: { ticketId } })`
- Imports: `useState`, `useEffect`, `ShoppingBag`, `ExternalLink`, `Package` from lucide; `Badge`, `Skeleton` from UI; `supabase` from client

### Part 2 — Inject Shopify Data into AI Context

**File: `supabase/functions/auto-reply-scheduler/index.ts`**

- After fetching settings (line ~88), also fetch `shopify_store_url` and `shopify_api_token` from settings select
- Before building `userMessage` (~line 121), add Shopify order fetch logic inline:
  - If `shopify_store_url` and `shopify_api_token` exist, call Shopify API directly (same logic as `get-shopify-customer-orders`)
  - Build `shopifyContext` string with order details
  - If not configured or error, set `shopifyContext = ''` (silently skip)
- Inject `shopifyContext` into `userMessage` before the last client message block

### Files to modify:
1. `src/components/helpdesk/CustomerInfoSidebar.tsx` — add orders section
2. `supabase/functions/auto-reply-scheduler/index.ts` — add Shopify context to AI prompt

