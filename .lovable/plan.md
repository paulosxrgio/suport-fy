

## Plan: Add "NOME DO PRODUTO" rule to both system prompts

### Changes

**File: `supabase/functions/auto-reply-scheduler/index.ts`**
- Insert the new "NOME DO PRODUTO" block after "TOM E FORMATO" section (after line 234, before "RASTREAMENTO")

**File: `supabase/functions/generate-ai-reply/index.ts`**
- Insert the same block after "TOM E FORMATO" section (after line 296, before "RASTREAMENTO")

### Content to insert (identical in both files)

```
NOME DO PRODUTO:
- NUNCA mencione o nome do produto comprado pelo cliente (ex: nunca diga "The Holy Bible – Deluxe Leathersoft Edition")
- Sempre refira-se apenas como "your order" + número do pedido
- Exemplos corretos:
  "Your order #HE1002 has been dispatched..."
  "I've checked your order #HE1002 and it is currently in transit..."
- Exemplos errados:
  "Your Holy Bible – Deluxe Leathersoft Edition has been dispatched..."
  "Your Bible is on its way..."
```

No other changes.

