

## Plan: Replace system prompt in both edge functions

### Problem
The current system prompt in `auto-reply-scheduler` and `generate-ai-reply` is missing critical spam/scam detection, system email handling, and refined response rules. Neither function currently fetches the store name needed for the new prompt's `${store.name}`.

### Changes

**File: `supabase/functions/auto-reply-scheduler/index.ts`**
1. After fetching settings (~line 129), add a query to fetch the store name from the `stores` table using `item.store_id`
2. Replace the `defaultSystemPrompt` (lines 167-240) with the new comprehensive prompt that includes spam detection, system email handling, and refined customer response rules, using the fetched store name

**File: `supabase/functions/generate-ai-reply/index.ts`**
1. After fetching ticket data (~line 35), add a query to fetch the store name from the `stores` table using `ticket.store_id`
2. Replace the `defaultSystemPrompt` (lines 226-299) with the same new prompt, using the fetched store name

### Store name fetch (added to both functions)
```typescript
const { data: storeData } = await supabase
  .from('stores')
  .select('name')
  .eq('id', storeId)
  .maybeSingle();
const storeName = storeData?.name || 'our store';
```

The new prompt will use `${storeName}` instead of `${store.name}`.

### No other changes
- No changes to the rest of the logic, user message building, or any other files

