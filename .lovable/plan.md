

## Plan: Fix AI Connection Verify via Edge Function

### 1. Create Edge Function `verify-ai-connection`

New file `supabase/functions/verify-ai-connection/index.ts` — accepts `{ provider, api_key, model }`, proxies a minimal request to OpenAI or Anthropic, returns `{ success, message/error }`.

Add to `supabase/config.toml`:
```toml
[functions.verify-ai-connection]
verify_jwt = false
```

### 2. Update `SettingsPage.tsx`

Replace `handleVerifyAI` (lines 125-167) to use `supabase.functions.invoke('verify-ai-connection', { body: { provider, api_key, model } })` instead of direct `fetch` calls to OpenAI/Anthropic APIs.

### Files modified
- New: `supabase/functions/verify-ai-connection/index.ts`
- Edit: `supabase/config.toml` (add function entry)
- Edit: `src/components/helpdesk/SettingsPage.tsx` (replace handleVerifyAI)

