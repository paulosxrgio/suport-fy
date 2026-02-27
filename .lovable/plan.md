

## Analysis

The Shopify API is returning 401 errors. Looking at the stored token (`shpss_...`), it doesn't start with `shpat_` which is the correct prefix for Shopify Admin API tokens. The URL cleanup and headers in both edge functions already look correct, so the main issue is the invalid token format.

The requested changes are mostly about adding a `shpat_` prefix validation, since the existing code already handles URL normalization and correct headers.

## Plan

### 1. Add `shpat_` token validation in SettingsPage.tsx

- In `handleVerifyShopify`, before calling the edge function, check if `shopifyApiToken` starts with `shpat_`. If not, show a warning toast: "O token deve começar com shpat_. Verifique se copiou o token correto."
- In `handleSaveSettings`, add the same warning (non-blocking) when saving a token that doesn't start with `shpat_`.

### 2. Add `shpat_` validation in verify-shopify-token edge function

- Before calling Shopify API, check if `apiToken` starts with `shpat_`. If not, return `{ success: false, error: 'Token inválido. O token da Shopify Admin API deve começar com shpat_' }`.

### 3. No other changes needed

- The URL cleanup (`replace(/^https?:\/\//, '').replace(/\/$/, '')`) is already in both `get-shopify-customer-orders` and `verify-shopify-token`.
- The `X-Shopify-Access-Token` header is already correct in both functions.
- The verify function already tests `GET /admin/api/2024-01/shop.json` correctly.

### Files to modify:
1. `src/components/helpdesk/SettingsPage.tsx` -- add `shpat_` validation warning
2. `supabase/functions/verify-shopify-token/index.ts` -- add `shpat_` prefix check

