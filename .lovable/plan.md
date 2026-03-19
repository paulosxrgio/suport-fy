

## Plan: Fix three bugs in edge functions

### 1. `auto-reply-scheduler/index.ts` — Fix `.reverse()` double mutation

**Lines 147-154**: Replace the messages processing to use a copy:
```typescript
const messagesSorted = [...(messages || [])].reverse(); // chronological copy

const conversationHistory = messagesSorted
  .map((msg) => {
    const role = msg.direction === 'inbound' ? 'Customer' : 'Sophia';
    return `${role}: ${msg.content}`;
  })
  .join('\n\n');
```

**Lines 156-160**: Update `allCustomerMessages` to use `messagesSorted` instead of `messages`:
```typescript
const allCustomerMessages = messagesSorted
  .filter((m: any) => m.direction === 'inbound')
  .map((m: any) => m.content)
  .join(' ') || '';
```

**Line 404**: Replace the second `.reverse()` call with using `messagesSorted`:
```typescript
const rawLastInbound = messagesSorted
  .filter(m => m.direction === 'inbound')
  .slice(-1)[0]?.content || '';
const lastInboundMessage = stripQuotedText(rawLastInbound);
```

### 2. `generate-ai-reply/index.ts` — Add memory + sentiment

**Lines 91-98**: Fix `.reverse()` to use a copy:
```typescript
const messagesSorted = [...(messages || [])].reverse();

const conversationHistory = messagesSorted
  .map((msg) => {
    const role = msg.direction === "inbound" ? "Customer" : "Sophia";
    return `${role}: ${msg.content}`;
  })
  .join("\n\n") || '';
```

**Line 471**: Fix `lastInboundMessage` to use `messagesSorted`:
```typescript
const rawLastInbound = messagesSorted
  .filter(m => m.direction === 'inbound')
  .slice(-1)[0]?.content || '';
const lastInboundMessage = stripQuotedText(rawLastInbound) || lastMessageContent || '';
```

**After line 469 (order context), before userMessage construction**: Insert customer memory fetch and sentiment detection blocks as specified by user.

**Lines 473-481**: Update `userMessage` to include `memoryContext` and `sentimentInstruction`:
```typescript
const userMessage = `
${orderContext}

${memoryContext}

${sentimentInstruction}

CONVERSATION HISTORY (read carefully before replying — continue naturally from where it left off):
${conversationHistory || 'This is the first message from this customer.'}

CUSTOMER'S LATEST MESSAGE:
${lastInboundMessage || 'No message.'}
`.trim();
```

Note: Need to add `stripQuotedText` function to generate-ai-reply (it exists in auto-reply-scheduler but may not exist in generate-ai-reply — will verify during implementation).

### 3. `process-inbound-email/index.ts` — Add `merge.email` to blocked senders

**Lines 326-332**: Add `'merge.email'` to the existing `blockedSenders` array and rename variable to match user's request (`isSystemEmail`):
```typescript
const blockedSenders = [
  'mailer@shopify.com',
  'noreply@shopify.com',
  'chargeflow.io',
  'mail.chargeflow.io',
  'hubspotemail.net',
  'merge.email',
];

const isSystemEmail = blockedSenders.some(blocked =>
  customerEmail.toLowerCase().includes(blocked)
);

if (isSystemEmail) {
  console.log('BLOCKED: System email from', customerEmail);
  return new Response(JSON.stringify({ success: true, skipped: true }), { status: 200 });
}
```

### Files modified
- `supabase/functions/auto-reply-scheduler/index.ts`
- `supabase/functions/generate-ai-reply/index.ts`
- `supabase/functions/process-inbound-email/index.ts`

