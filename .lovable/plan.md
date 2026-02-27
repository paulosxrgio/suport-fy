

## Plan: Migrate Shopify Auth to Client Credentials (OAuth)

### 1. Database Migration
Add two new columns to `settings`:
```sql
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS shopify_client_id text,
ADD COLUMN IF NOT EXISTS shopify_client_secret text;
```
Keep `shopify_api_token` for storing the temporary token (optional/cache).

### 2. Update SettingsPage.tsx
- Replace the single "API Token" field with two fields: **Client ID** and **Client Secret** (both `type="password"` with show/hide toggle)
- Add state: `shopifyClientId`, `shopifyClientSecret`, `showShopifyClientId`, `showShopifyClientSecret`
- Load from `shopify_client_id` / `shopify_client_secret`
- Save to those columns; remove `shopify_api_token` from save data
- Remove `shpat_` validation
- Update verify button: disabled unless `shopifyStoreUrl + shopifyClientId + shopifyClientSecret` are filled
- Pass `clientId` and `clientSecret` to verify function instead of `apiToken`

### 3. Update verify-shopify-token Edge Function
- Accept `{ storeUrl, clientId, clientSecret }` instead of `{ storeUrl, apiToken }`
- Remove `shpat_` prefix check
- Add `getShopifyToken()` helper that POSTs to `https://{cleanUrl}/admin/oauth/access_token` with `client_id`, `client_secret`, `grant_type: 'client_credentials'`
- Use returned `access_token` to test `GET /admin/api/2024-01/shop.json`

### 4. Update get-shopify-customer-orders Edge Function
- Fetch `shopify_client_id` and `shopify_client_secret` from settings instead of `shopify_api_token`
- Add same `getShopifyToken()` helper
- Generate token before calling orders API
- Use generated token in `X-Shopify-Access-Token` header

### 5. Update auto-reply-scheduler Edge Function
- Update settings select to include `shopify_client_id`, `shopify_client_secret` instead of `shopify_api_token`
- Add same `getShopifyToken()` helper
- Generate token before Shopify orders fetch
- Use generated token in header

### Files to modify:
1. **Database migration** — add `shopify_client_id` and `shopify_client_secret` columns
2. `src/components/helpdesk/SettingsPage.tsx` — replace API token field with Client ID + Client Secret
3. `supabase/functions/verify-shopify-token/index.ts` — use client credentials OAuth flow
4. `supabase/functions/get-shopify-customer-orders/index.ts` — use client credentials OAuth flow
5. `supabase/functions/auto-reply-scheduler/index.ts` — use client credentials OAuth flow

