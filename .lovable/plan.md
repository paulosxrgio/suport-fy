

## Plan: AI Self-Improvement System — Stage 1: Database + Analyzer

### 1. Database Migration

Create tables `response_quality_log` and `prompt_suggestions` with RLS policies scoped by `store_id`. Add `prompt_version` and `prompt_auto_improve` columns to `settings`.

- `response_quality_log`: stores per-response quality scores, issues, and positive aspects
- `prompt_suggestions`: stores AI-generated prompt improvement suggestions
- RLS: same pattern as other tables (store_id IN select stores where user_id = auth.uid())
- Indexes on `(store_id, created_at)` and `(store_id, score)`

### 2. Create Edge Function `analyze-response`

New file: `supabase/functions/analyze-response/index.ts`

- Receives store_id, ticket_id, customer_email, customer_message, ai_response, sentiment, and API keys
- Uses the appropriate provider (Anthropic or OpenAI) to score the response 0-100 with issues/positive aspects
- Inserts result into `response_quality_log`
- Add to `supabase/config.toml` with `verify_jwt = false`

### 3. Integrate in `auto-reply-scheduler`

After the outbound message is saved (around line 957), add a non-blocking `fetch` call to `analyze-response`, passing store_id, ticket_id, customer data, cleanedReply, sentiment, and API keys. Wrapped in try/catch so failures never block the main flow.

### Files modified
- New migration SQL
- New `supabase/functions/analyze-response/index.ts`
- `supabase/config.toml` (add function entry)
- `supabase/functions/auto-reply-scheduler/index.ts` (add analyze call ~line 957)

