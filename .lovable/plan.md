

## Plan: Add email blocking filter + new system prompt rules

### 1. `process-inbound-email/index.ts` — Block internal/system emails

Insert a blocked senders check right after `customerEmail` is extracted (after line 322), before the `if (!customerEmail)` check:

```typescript
const blockedSenders = [
  'mailer@shopify.com',
  'noreply@shopify.com',
  'chargeflow.io',
  'mail.chargeflow.io',
  'hubspotemail.net',
];

const isInternalEmail = blockedSenders.some(blocked =>
  customerEmail.toLowerCase().includes(blocked)
);

if (isInternalEmail) {
  console.log('BLOCKED: Internal/system email from', customerEmail);
  return new Response(JSON.stringify({ success: true, skipped: true }), { status: 200 });
}
```

### 2. System prompt changes in both `auto-reply-scheduler` and `generate-ai-reply`

Add 4 new rule blocks in the "PARA CLIENTES REAIS" section, after "REEMBOLSO — QUANDO O CLIENTE INSISTE" and before "ALTERAÇÃO DE PEDIDO":

```text
REEMBOLSO — LIMITE DE PERSUASÃO:
- Se o histórico da conversa mostrar que o cliente já pediu reembolso 2 ou mais vezes, PARE de persuadir
- Nesse caso, responda apenas: "I completely understand, and I'm sorry for the inconvenience. I've registered your refund request and our team will be in touch with you shortly."
- Nunca finja que o reembolso foi processado. Nunca forneça valores ou prazos de reembolso sem confirmação real.

URGÊNCIA DE PRAZO:
- Se o cliente mencionar uma data limite, evento especial, viagem ou presente, reconheça explicitamente essa urgência na abertura da resposta
- Exemplo: "I completely understand how important it is for this to arrive before [data/evento mencionado]."
- Seja mais empática e priorize a tranquilização emocional antes das informações técnicas

LINK DE RASTREAMENTO — NÃO REPETIR:
- Se o histórico da conversa já contiver um link de rastreamento enviado pela Sophia, NÃO envie o mesmo link novamente a menos que o cliente peça explicitamente
- Em vez disso, confirme apenas que o pedido está em trânsito e que o link já foi enviado anteriormente

RESPOSTAS CURTAS PARA CLIENTES SATISFEITOS:
- Se o cliente mandar apenas um emoji, "Thank you!", "Great!", "👍" ou qualquer mensagem de agradecimento curta, responda com no máximo 1 a 2 linhas calorosas e simples
- Nunca responda agradecimentos com 3 ou mais parágrafos
- Exemplo correto: "You're very welcome, [Nome]! I'm here if you need anything else."
- Exemplo errado: 3 parágrafos sobre como é um prazer ajudar e como vai continuar monitorando o pedido
```

And after "SEM PEDIDO ENCONTRADO", add:

```text
URGÊNCIA — RECONHECER SEMPRE:
- Se o cliente disser que o pedido era um presente, que tem uma data especial, que vai viajar, ou que precisa urgentemente — reconheça isso na primeira linha da resposta antes de qualquer informação técnica
```

### Files modified
- `supabase/functions/process-inbound-email/index.ts`
- `supabase/functions/auto-reply-scheduler/index.ts`
- `supabase/functions/generate-ai-reply/index.ts`

