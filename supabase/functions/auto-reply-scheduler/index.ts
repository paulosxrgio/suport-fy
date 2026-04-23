import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

// Strip quoted text from email replies (multi-language support)
function stripQuotedText(text: string): string {
  if (!text) return '';
  
  const lines = text.split('\n');
  const cleanLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (/^Em\s.+escreveu:/i.test(trimmed)) break;
    if (/^On\s.+wrote:/i.test(trimmed)) break;
    if (/^Le\s.+a\s+écrit\s*:/i.test(trimmed)) break;
    if (/^El\s.+escribi[oó]:/i.test(trimmed)) break;
    if (/^Am\s.+schrieb/i.test(trimmed)) break;
    if (/<[^>]+@[^>]+>\s*(wrote|escreveu|a écrit|escribió|schrieb)\s*:/i.test(trimmed)) break;
    if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{3,}\s*Mensagem Original\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{5,}$/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^From:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^De:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Sent:\s/i.test(trimmed)) break;
    if (/^Enviado:\s/i.test(trimmed)) break;
    if (/^To:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Para:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Subject:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Assunto:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^--\s*$/.test(trimmed)) break;
    if (/^—\s*$/.test(trimmed)) break;
    if (/^_{3,}$/.test(trimmed) && cleanLines.length > 0) break;
    if (trimmed.startsWith('>') && cleanLines.length > 0) continue;
    
    cleanLines.push(line);
  }
  
  let result = cleanLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}

function stripMarkdownLinks(text: string): string {
  if (!text) return text;
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$2');
  text = text.replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/^#{1,3}\s+/gm, '');
  return text.trim();
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== AUTO-REPLY SCHEDULER START ===');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================
    // STEP 1: Buscar itens prontos da fila (até 5)
    // ========================================
    const { data: queueItems, error: queueError } = await supabase
      .from('auto_reply_queue')
      .select('id, ticket_id, store_id')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(5);

    if (queueError) {
      console.error('Step 1 - Erro ao buscar fila:', queueError);
      throw queueError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('Step 1 - Nenhum item pendente na fila');
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Step 1 - ${queueItems.length} item(ns) encontrado(s) na fila`);

    let processedCount = 0;
    let failedCount = 0;

    for (const item of queueItems) {
      try {
        console.log(`--- Processando item ${item.id} (ticket: ${item.ticket_id}) ---`);

        // Marcar como 'processing' para evitar duplicação
        const { error: lockError } = await supabase
          .from('auto_reply_queue')
          .update({ status: 'processing' })
          .eq('id', item.id)
          .eq('status', 'pending'); // Atomic check

        if (lockError) {
          console.error(`Item ${item.id} - Erro ao travar:`, lockError);
          continue;
        }

        // ========================================
        // STEP 2a: Gerar resposta com IA
        // (mesma lógica de generate-ai-reply)
        // ========================================

        // Buscar ticket
        const { data: ticket, error: ticketError } = await supabase
          .from('tickets')
          .select('subject, customer_name, customer_email, store_id, thread_subject, last_message_id, references_chain')
          .eq('id', item.ticket_id)
          .single();

        if (ticketError || !ticket) {
          throw new Error(`Ticket ${item.ticket_id} não encontrado`);
        }

        // Buscar settings da loja
        const { data: settings } = await supabase
          .from('settings')
          .select('openai_api_key, ai_model, ai_system_prompt, sender_name, sender_email, email_signature, resend_api_key, shopify_store_url, shopify_client_id, shopify_client_secret, ai_provider, anthropic_api_key')
          .eq('store_id', item.store_id)
          .maybeSingle();

        const aiProvider = (settings as any)?.ai_provider || 'openai';

        if (aiProvider === 'anthropic') {
          if (!(settings as any)?.anthropic_api_key) {
            throw new Error(`Anthropic API key não configurada para loja ${item.store_id}`);
          }
        } else {
          if (!settings?.openai_api_key) {
            throw new Error(`OpenAI API key não configurada para loja ${item.store_id}`);
          }
        }

        const useAnthropic = aiProvider === 'anthropic';

        if (!settings?.resend_api_key) {
          throw new Error(`Resend API key não configurada para loja ${item.store_id}`);
        }

        // Buscar últimas 5 mensagens para contexto
        const { data: messages } = await supabase
          .from('messages')
          .select('content, direction, created_at')
          .eq('ticket_id', item.ticket_id)
          .order('created_at', { ascending: false })
          .limit(5);

        // Build history in chronological order with clear roles
        const messagesSorted = [...(messages || [])].reverse(); // chronological copy

        const conversationHistory = messagesSorted
          .map((msg) => {
            const role = msg.direction === 'inbound' ? 'Customer' : 'Sophia';
            return `${role}: ${msg.content}`;
          })
          .join('\n\n');

        // Detect order number mentioned in customer messages
        const allCustomerMessages = messagesSorted
          .filter((m: any) => m.direction === 'inbound')
          .map((m: any) => m.content)
          .join(' ') || '';
        const orderNumberMatch = allCustomerMessages.match(/#?(\d{4,})/);
        const mentionedOrderNumber = orderNumberMatch ? orderNumberMatch[1] : null;
        if (mentionedOrderNumber) {
          console.log(`Item ${item.id} - Detected order number in messages: #${mentionedOrderNumber}`);
        }

        // Fetch store name for the prompt
        const { data: storeData } = await supabase
          .from('stores')
          .select('name')
          .eq('id', item.store_id)
          .maybeSingle();
        const storeName = storeData?.name || 'our store';

        const defaultSystemPrompt = `You are Sophia, the customer support agent for ${storeName}.

━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE RULES — CRITICAL
━━━━━━━━━━━━━━━━━━━━━━

Default language: English.
Auto-detect the customer's language from their message and reply in the SAME language.
Supported: English, Portuguese, Spanish, French, Korean, Italian, German.
NEVER say "I can only respond in English" — always match the customer's language.

Examples:
- Customer writes in Portuguese → reply in Portuguese
- Customer writes in Korean → reply in Korean
- Customer writes in English → reply in English

━━━━━━━━━━━━━━━━━━━━━━
CORE PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━

GOLDEN RULE: Resolve the issue in the same message whenever possible.
Never ask for information you already have.
Never redirect without trying to help first.

Tone: Like a knowledgeable friend who works at the store. Not robotic, not overly formal.
Format: Short messages — email is not a novel. Max 3 short paragraphs.
Signature: Always sign as "Sophia — ${storeName} Support"

━━━━━━━━━━━━━━━━━━━━━━
SPAM & SOLICITATION — ZERO TOLERANCE
━━━━━━━━━━━━━━━━━━━━━━

These are SPAM — close immediately after ONE reply:
- "Can I speak with the store owner?"
- "I help Shopify store owners"
- "I noticed issues with your store"
- "I can get you 20-30 orders"
- "Shopify expert" / "e-commerce consultant"
- "collaboration" / "partnership proposal" (unless from verified brand email)
- Any message asking to speak with "the owner" or "manager" without an order
- AI/chatbot sales pitches

ONE response only:
"Hi, this channel is for customer order support only. We're unable to assist with business inquiries here. Kind regards, Sophia"

Then close the ticket. Do NOT engage further even if they follow up.

EXCEPTION — Legitimate partnership (verified brand domain):
If email domain looks professional/brand (not gmail/hotmail) and mentions influencer/collab:
"Hi! Thank you for reaching out. I've forwarded your proposal to our marketing team — they'll be in touch if there's a fit. Kind regards, Sophia"

━━━━━━━━━━━━━━━━━━━━━━
ORDER ISSUES — RESOLVE WITH DATA
━━━━━━━━━━━━━━━━━━━━━━

When a customer mentions an order issue:
1. ALWAYS search for their order first (by email, order number, or name)
2. NEVER give a generic response without data — show the actual order status
3. If order found: give status + tracking link immediately
4. If not found: ask which store they ordered from BEFORE saying anything else

Wrong order received / item mix-up:
- Acknowledge immediately with empathy
- Register a swap request in the system
- Offer resolution: correct item sent OR refund
- Never make the customer wait or "contact another department"

━━━━━━━━━━━━━━━━━━━━━━
FRAUD ACCUSATION / "IS THIS A SCAM?"
━━━━━━━━━━━━━━━━━━━━━━

If customer says "fraud", "scam", "fake", "ARE YOU REAL?":
1. Find their order FIRST — respond with real data
2. If order found: show status + tracking — facts beat words
3. If not found: ask which store they ordered from, don't defend blindly
4. NEVER say "we are 100% legitimate" without showing actual order data

━━━━━━━━━━━━━━━━━━━━━━
DELIVERY DELAYS
━━━━━━━━━━━━━━━━━━━━━━

Standard delivery: 8–15 business days from dispatch.
Products ship directly from the manufacturer — tracking updates happen at checkpoints and may appear slow between them, but the order is moving.

If customer asks about delay:
1. Show the tracking link immediately
2. Give the dispatch date and estimated arrival window
3. Be honest — never promise a date you can't guarantee

━━━━━━━━━━━━━━━━━━━━━━
REFUND & CANCELLATION
━━━━━━━━━━━━━━━━━━━━━━

First mention of refund/cancellation:
Be empathetic, understand the reason, offer an alternative if possible (exchange, store credit).

Second mention / customer insists:
Accept without resistance. Direct to the refund form.
"Absolutely understood. To process your refund as quickly as possible, please fill out the form below — our team will handle it with priority: [REFUND_LINK]"

NEVER: be cold, bureaucratic, or make the process seem difficult.

━━━━━━━━━━━━━━━━━━━━━━
ANTI-HALLUCINATION — NEVER INVENT
━━━━━━━━━━━━━━━━━━━━━━

NEVER say:
- "I've checked and your order..." if you don't have order data in context
- Tracking numbers you haven't verified
- Delivery dates you cannot confirm
- Product specs not in the context
- That you "processed" something you haven't

If you don't know: say it honestly and tell them what you CAN do.

━━━━━━━━━━━━━━━━━━━━━━
PRODUCT NAME — NEVER MENTION
━━━━━━━━━━━━━━━━━━━━━━

Never write the product name in your response. Never say specific product titles, editions, or descriptions.
Only reference the order by number: "your order #XXXX".

━━━━━━━━━━━━━━━━━━━━━━
FORBIDDEN PHRASES
━━━━━━━━━━━━━━━━━━━━━━

Never use:
- "I hope this message finds you well"
- "Thank you for contacting us"
- "I apologize for any inconvenience"
- "As per our policy..."
- "Please don't hesitate to reach out"
- Any phrase a generic chatbot would use

━━━━━━━━━━━━━━━━━━━━━━
FORMATTING
━━━━━━━━━━━━━━━━━━━━━━

- Plain text only — no markdown, no bullet lists, no headings
- No em-dashes (—, –, -) used as sentence separators
- Tracking links as raw URLs on their own line
- Sign every message: "Kind regards,\nSophia — ${storeName} Support"`;

        const systemPrompt = settings.ai_system_prompt
          ? `${defaultSystemPrompt}

━━━━━━━━━━━━━━━━━━━━━━
REGRAS ESPECÍFICAS DESTA LOJA — PRIORIDADE MÁXIMA
━━━━━━━━━━━━━━━━━━━━━━
${settings.ai_system_prompt}`
          : defaultSystemPrompt;

        const rawLastInbound = messagesSorted
          .filter(m => m.direction === 'inbound')
          .slice(-1)[0]?.content || '';
        const lastInboundMessage = stripQuotedText(rawLastInbound);
        console.log(`Item ${item.id} - Last inbound cleaned: ${rawLastInbound.length} → ${lastInboundMessage.length} chars`);

        // ========================================
        // STEP 2a.2: Buscar pedidos Shopify do cliente
        // ========================================
        let shopifyContext = '';
        let shopifyCustomerName: string | null = null;
        let shopifyOrders: any[] = [];
        try {
          const shopifyUrl = (settings as any)?.shopify_store_url;
          const shopifyClientId = (settings as any)?.shopify_client_id;
          const shopifyClientSecret = (settings as any)?.shopify_client_secret;

          if (shopifyUrl && shopifyClientId && shopifyClientSecret) {
            const cleanUrl = shopifyUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

            // Get token via client credentials
            const tokenResponse = await fetch(`https://${cleanUrl}/admin/oauth/access_token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: shopifyClientId,
                client_secret: shopifyClientSecret,
                grant_type: 'client_credentials',
              }),
            });
            const tokenData = await tokenResponse.json();
            if (!tokenResponse.ok) throw new Error(`Shopify auth failed: ${JSON.stringify(tokenData)}`);
            const accessToken = tokenData.access_token;

            const graphqlUrl = `https://${cleanUrl}/admin/api/2025-01/graphql.json`;

            let orders: any[] = [];

            // Query 1 — buscar cliente pelo email (com legacyResourceId)
            const customerQuery = `#graphql
              query($q: String!) {
                customers(first: 1, query: $q) {
                  nodes {
                    id
                    legacyResourceId
                    displayName
                    numberOfOrders
                    amountSpent { amount currencyCode }
                  }
                }
              }
            `;

            const customerResponse = await fetch(graphqlUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
              },
              body: JSON.stringify({
                query: customerQuery,
                variables: { q: `email:"${ticket.customer_email}"` },
              }),
            });

            if (customerResponse.ok) {
              const customerData = await customerResponse.json();
              const customer = customerData?.data?.customers?.nodes?.[0];

              if (customer) {
                shopifyCustomerName = customer.displayName || null;
                const customerId = customer.legacyResourceId;

                // Query 2 — buscar pedidos pelo legacyResourceId do cliente
                const ordersQuery = `#graphql
                  query($q: String!) {
                    orders(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) {
                      edges {
                        node {
                          name
                          displayFinancialStatus
                          displayFulfillmentStatus
                          totalPriceSet { shopMoney { amount currencyCode } }
                          lineItems(first: 10) {
                            nodes {
                              name
                              variantTitle
                              quantity
                            }
                          }
                          fulfillments {
                            trackingInfo { number company }
                          }
                        }
                      }
                    }
                  }
                `;

                const ordersResponse = await fetch(graphqlUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken,
                  },
                  body: JSON.stringify({
                    query: ordersQuery,
                    variables: { q: `customer_id:${customerId}` },
                  }),
                });

                const ordersData = await ordersResponse.json();
                orders = ordersData?.data?.orders?.edges?.map((edge: any) => {
                  const order = edge.node;
                  return {
                    order_number: order.name,
                    status: order.displayFulfillmentStatus || 'unfulfilled',
                    financial_status: order.displayFinancialStatus,
                    total_price: order.totalPriceSet?.shopMoney?.amount,
                    currency: order.totalPriceSet?.shopMoney?.currencyCode,
                    items: order.lineItems?.nodes?.map((item: any) => ({
                      name: item.name,
                      variant: item.variantTitle,
                      quantity: item.quantity,
                    })) || [],
                    tracking_number: order.fulfillments?.[0]?.trackingInfo?.[0]?.number || null,
                    tracking_company: order.fulfillments?.[0]?.trackingInfo?.[0]?.company || null,
                  };
                }) || [];
              }
            }

            // Fallback: if no orders found by email but customer mentioned an order number, search by order number
            if (orders.length === 0 && mentionedOrderNumber) {
              console.log(`Item ${item.id} - No orders by email, searching by order number #${mentionedOrderNumber}...`);

              const searchByNumberQuery = `#graphql
                query($q: String!) {
                  orders(first: 1, query: $q) {
                    nodes {
                      name
                      displayFinancialStatus
                      displayFulfillmentStatus
                      createdAt
                      totalPriceSet { shopMoney { amount currencyCode } }
                      lineItems(first: 10) {
                        nodes {
                          name
                          variantTitle
                          quantity
                          originalUnitPriceSet { shopMoney { amount } }
                        }
                      }
                      fulfillments {
                        trackingInfo { number url company }
                      }
                    }
                  }
                }
              `;

              const searchRes = await fetch(graphqlUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Shopify-Access-Token': accessToken,
                },
                body: JSON.stringify({
                  query: searchByNumberQuery,
                  variables: { q: `name:#${mentionedOrderNumber}` },
                }),
              });

              if (searchRes.ok) {
                const searchData = await searchRes.json();
                const foundOrder = searchData?.data?.orders?.nodes?.[0];

                if (foundOrder) {
                  orders = [{
                    order_number: foundOrder.name,
                    status: foundOrder.displayFulfillmentStatus || 'unfulfilled',
                    financial_status: foundOrder.displayFinancialStatus,
                    total_price: foundOrder.totalPriceSet?.shopMoney?.amount,
                    currency: foundOrder.totalPriceSet?.shopMoney?.currencyCode,
                    items: foundOrder.lineItems?.nodes?.map((item: any) => ({
                      name: item.name,
                      variant: item.variantTitle,
                      quantity: item.quantity,
                    })) || [],
                    tracking_number: foundOrder.fulfillments?.[0]?.trackingInfo?.[0]?.number || null,
                    tracking_company: foundOrder.fulfillments?.[0]?.trackingInfo?.[0]?.company || null,
                  }];
                  console.log(`Item ${item.id} - ORDER FOUND BY NUMBER: #${mentionedOrderNumber}`);
                }
              }
            }

            if (orders.length > 0) {
              shopifyContext = `\n\nDADOS DOS PEDIDOS DO CLIENTE NA SHOPIFY:\n${orders.map((o: any) => `\n- Pedido ${o.order_number} | Status: ${o.status} | Pagamento: ${o.financial_status} | Total: ${o.currency} ${o.total_price}\n  Produtos: ${o.items.map((i: any) => `${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity}`).join(', ')}\n  Rastreamento: ${o.tracking_number || 'Não disponível'} ${o.tracking_company ? `via ${o.tracking_company}` : ''}`).join('')}`;
            } else {
              shopifyContext = '\n\nDADOS SHOPIFY: Nenhum pedido encontrado para este cliente.';
            }
            shopifyOrders = orders;
          }
        } catch (shopifyError) {
          console.log(`Item ${item.id} - Shopify fetch skipped:`, shopifyError);
        }

        // Extract customer first name (priority: Shopify displayName > order customer_name > ticket name > email)
        const fullName =
          shopifyCustomerName ||
          shopifyOrders?.[0]?.customer_name ||
          ticket.customer_name ||
          null;

        const customerFirstName =
          fullName?.split(' ')[0] ||
          fullName?.split(' ').slice(-1)[0] ||
          ticket.customer_email?.split('@')[0];
        
        console.log(`Item ${item.id} - Customer name resolved: "${customerFirstName}" (from fullName: "${fullName}")`);

        // ========================================
        // STEP 2a.3: Buscar memória do cliente
        // ========================================
        let customerMemory: any = null;
        let memoryContext = 'CUSTOMER MEMORY: First interaction with this customer.';
        try {
          const { data: memData } = await supabase
            .from('customer_memory')
            .select('*')
            .eq('store_id', item.store_id)
            .eq('customer_email', ticket.customer_email)
            .maybeSingle();

          customerMemory = memData;

          if (customerMemory) {
            memoryContext = `
CUSTOMER MEMORY (from previous interactions — use this to personalize your response):
- Preferred edition: ${customerMemory.preferred_edition || 'unknown'}
- Preferred language: ${customerMemory.preferred_language || 'unknown'}
- Total interactions: ${customerMemory.total_interactions}
- Last sentiment: ${customerMemory.last_sentiment || 'unknown'}
- Notes: ${customerMemory.notes || 'none'}`;
          }
        } catch (memError) {
          console.log(`Item ${item.id} - Memory fetch skipped:`, memError);
        }

        // ========================================
        // STEP 2a.4: Detectar sentimento do cliente
        // ========================================
        let sentiment = 'neutral';
        let detectedLanguage = 'English';
        try {
          const sentimentResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.openai_api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `Analyze the customer message and return ONLY a valid JSON object, no markdown:
{
  "sentiment": "positive" | "neutral" | "frustrated" | "furious",
  "language": "the exact language of the message, e.g: English, Portuguese, Spanish, French",
  "reason": "one short sentence explaining why you classified this sentiment"
}

Classification rules:
- positive: customer is happy, thankful, or satisfied
- neutral: simple question, no emotional charge
- frustrated: impatient, complaining about delay, asking where is order, mild pressure
- furious: threats of dispute, chargeback, PayPal claim, trading standards, lawyer, strong language, aggressive tone`
                },
                { role: 'user', content: lastInboundMessage }
              ],
              max_tokens: 100,
              temperature: 0,
            }),
          });

          if (sentimentResponse.ok) {
            const sentimentData = await sentimentResponse.json();
            const parsed = JSON.parse(sentimentData.choices?.[0]?.message?.content?.trim());
            sentiment = parsed.sentiment || 'neutral';
            detectedLanguage = parsed.language || 'English';
            console.log(`Item ${item.id} - SENTIMENT: ${sentiment} | LANGUAGE: ${detectedLanguage} | REASON: ${parsed.reason}`);
          }
        } catch (sentimentError) {
          console.log(`Item ${item.id} - Sentiment detection skipped:`, sentimentError);
        }

        const sentimentInstruction = {
          positive: `TONE INSTRUCTION: The customer is happy and satisfied. Be warm, friendly and concise. Match their positive energy.`,
          neutral: `TONE INSTRUCTION: The customer has a simple question. Be clear, helpful and efficient. No need for extra reassurance.`,
          frustrated: `TONE INSTRUCTION: The customer is frustrated or impatient. Start with a genuine, heartfelt apology. Validate their feeling before giving any information. Be extra warm and personal. Use phrases like "I completely understand how frustrating this must feel" and "I'm personally looking into this for you right now."`,
          furious: `TONE INSTRUCTION: The customer is furious and may be threatening a dispute or chargeback. Stay completely calm and do NOT match their energy. Start with a sincere, humble apology. Acknowledge their frustration fully before any explanation. Be extremely empathetic and solution-focused. Never be defensive. Use phrases like "I'm truly sorry this has been your experience" and "I want to make this right for you personally."`,
        }[sentiment] || `TONE INSTRUCTION: Be warm, friendly and professional.`;

        const languageInstruction = `LANGUAGE INSTRUCTION: The customer wrote in ${detectedLanguage}. You MUST respond in ${detectedLanguage} only. Do not mix languages.`;

        const userMessage = (() => {
          const orderContext = shopifyContext && !shopifyContext.includes('Nenhum pedido encontrado') 
            ? shopifyContext + `\n- Primeiro nome do cliente: ${customerFirstName}`
            : `\nSHOPIFY DATA: No order found for this customer's email or order number yet.\nINSTRUCTION: Respond naturally to the customer's question. At the end, politely ask them to confirm their order number so you can look into it right away. Say something like: "Could you please share your order number with me? It usually starts with # and can be found in your confirmation email."\n- Primeiro nome do cliente: ${customerFirstName}`;

          return `
${orderContext}

${memoryContext}

${sentimentInstruction}

${languageInstruction}

CONVERSATION HISTORY (read carefully before replying — continue naturally from where it left off):
${conversationHistory || 'This is the first message from this customer.'}

CUSTOMER'S LATEST MESSAGE:
${lastInboundMessage || 'No message.'}
`.trim();
        })();

        const model = settings.ai_model || (useAnthropic ? 'claude-haiku-4-5-20251001' : 'gpt-4o');

        console.log(`Item ${item.id} - Chamando ${useAnthropic ? 'Anthropic' : 'OpenAI'} (${model})...`);

        let aiReply = '';

        if (useAnthropic) {
          const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': (settings as any).anthropic_api_key,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              system: systemPrompt,
              messages: [
                { role: 'user', content: userMessage }
              ],
            }),
          });

          if (!anthropicResponse.ok) {
            const err = await anthropicResponse.text();
            throw new Error(`Anthropic API error: ${err}`);
          }

          const anthropicData = await anthropicResponse.json();
          aiReply = anthropicData.content?.[0]?.text?.trim() || '';
        } else {
          const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.openai_api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
              ],
              max_tokens: 500,
              temperature: 0.7,
            }),
          });

          if (!openaiResponse.ok) {
            const errorText = await openaiResponse.text();
            throw new Error(`OpenAI API error ${openaiResponse.status}: ${errorText}`);
          }

          const openaiData = await openaiResponse.json();
          aiReply = openaiData.choices?.[0]?.message?.content?.trim() || '';
        }

        if (!aiReply) {
          throw new Error('IA não gerou resposta');
        }

        const cleanedReply = stripMarkdownLinks(aiReply);

        console.log(`Item ${item.id} - Resposta IA gerada (${cleanedReply.length} chars)`);

        // ========================================
        // STEP 2a.3: Classificar solicitação do cliente
        // ========================================
        const lastInboundMsg = messages?.find(m => m.direction === 'inbound')?.content || '';
        try {
          const classifyResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.openai_api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are a classifier. Analyze the customer message and detect if they are requesting any of these actions:

- edition_change: customer wants to change Bible edition (ESV, NIV, etc.)
- address_change: customer wants to change delivery address
- model_change: customer wants to change color or model
- cancellation: customer wants to cancel the order

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "detected": true or false,
  "type": "edition_change" | "address_change" | "model_change" | "cancellation" | null,
  "details": {
    "from": "current value if mentioned",
    "to": "requested value if mentioned",
    "new_address": "full address if mentioned",
    "order_number": "order number if mentioned"
  },
  "description": "short human-readable summary in English, max 1 sentence"
}

If no actionable request is detected, return { "detected": false, "type": null, "details": {}, "description": "" }`
                },
                {
                  role: 'user',
                  content: lastInboundMsg,
                }
              ],
              max_tokens: 200,
              temperature: 0,
            }),
          });

          if (classifyResponse.ok) {
            const classifyData = await classifyResponse.json();
            const classifyText = classifyData.choices?.[0]?.message?.content?.trim();

            const classification = JSON.parse(classifyText);

            if (classification.detected && classification.type) {
              await supabase.from('requests').insert({
                ticket_id: item.ticket_id,
                store_id: item.store_id,
                customer_name: ticket.customer_name,
                customer_email: ticket.customer_email,
                type: classification.type,
                description: classification.description,
                details: {
                  ...classification.details,
                  order_number: classification.details?.order_number || null,
                },
                status: 'pending',
              });
              console.log(`Item ${item.id} - REQUEST CREATED:`, classification.type, classification.description);
            } else {
              console.log(`Item ${item.id} - No actionable request detected`);
            }
          }
        } catch (classifyError) {
          console.error(`Item ${item.id} - Classification error (non-blocking):`, classifyError);
        }

        // ========================================
        // STEP 2b: Enviar email
        // (mesma lógica de send-email-reply)
        // ========================================

        const senderName = settings.sender_name || 'Suporte';
        const senderEmail = settings.sender_email || 'suporte@exemplo.com';
        const emailSignature = settings.email_signature;

        const resend = new Resend(settings.resend_api_key);
        const fromAddress = `${senderName} <${senderEmail}>`;

        const fullContent = emailSignature
          ? `${cleanedReply}\n\n${emailSignature}`
          : cleanedReply;

        // Threading (RFC 2822)
        const originalSubject = ticket.thread_subject || ticket.subject;
        let emailSubject = originalSubject;
        if (!emailSubject.toLowerCase().startsWith('re:')) {
          emailSubject = `Re: ${emailSubject}`;
        }

        const emailHeaders: Record<string, string> = {};
        if (ticket.last_message_id) {
          emailHeaders['In-Reply-To'] = ticket.last_message_id;
        }
        const references = ticket.references_chain?.join(' ') || '';
        if (references) {
          emailHeaders['References'] = references;
        }
        emailHeaders['Idempotency-Key'] = `auto-reply-${item.id}-${Date.now()}`;

        const htmlContent = `<p>${fullContent.replace(/\n/g, '<br>')}</p>`;

        console.log(`Item ${item.id} - Enviando email para ${ticket.customer_email}...`);

        const emailResult = await resend.emails.send({
          from: fromAddress,
          to: [ticket.customer_email],
          subject: emailSubject,
          html: htmlContent,
          text: fullContent,
          headers: emailHeaders,
        });

        console.log(`Item ${item.id} - Email enviado:`, emailResult);

        const sentMessageId = emailResult.data?.id ? `<${emailResult.data.id}@resend.dev>` : null;

        // Salvar mensagem outbound
        await supabase
          .from('messages')
          .insert({
            ticket_id: item.ticket_id,
            content: cleanedReply,
            direction: 'outbound',
            sender_email: senderEmail,
            email_message_id: sentMessageId,
            store_id: item.store_id,
          });

        // Análise de qualidade da resposta (não bloqueante)
        try {
          await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze-response`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({
              store_id: item.store_id,
              ticket_id: item.ticket_id,
              customer_email: ticket.customer_email,
              customer_message: lastInboundMessage,
              ai_response: cleanedReply,
              sentiment,
              openai_api_key: settings.openai_api_key,
              anthropic_api_key: settings.anthropic_api_key,
              ai_provider: settings.ai_provider || 'openai',
            }),
          });
          console.log('Analysis triggered successfully');
        } catch (e) {
          console.error('Analysis trigger failed (non-blocking):', e);
        }

        // Atualizar threading do ticket
        if (sentMessageId) {
          const updatedReferences = [...(ticket.references_chain || [])];
          if (!updatedReferences.includes(sentMessageId)) {
            updatedReferences.push(sentMessageId);
          }

          await supabase
            .from('tickets')
            .update({
              last_message_id: sentMessageId,
              references_chain: updatedReferences,
            })
            .eq('id', item.ticket_id);
        }

        // ========================================
        // STEP 2c: Fechar o ticket
        // ========================================
        await supabase
          .from('tickets')
          .update({ status: 'closed' })
          .eq('id', item.ticket_id);

        // ========================================
        // STEP 2c.2: Atualizar memória do cliente
        // ========================================
        try {
          const updateMemoryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.openai_api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `Analyze this customer interaction and extract memory data. Respond ONLY with valid JSON, no markdown:
{
  "preferred_edition": "ESV or NIV or null if not mentioned",
  "preferred_language": "detected language of customer message (e.g. English, Portuguese)",
  "last_sentiment": "positive, neutral, frustrated or angry",
  "notes": "one sentence summary of what the customer wanted or any important detail to remember"
}`
                },
                {
                  role: 'user',
                  content: `Customer message: ${lastInboundMessage}\n\nSophia's reply: ${cleanedReply}`
                }
              ],
              max_tokens: 150,
              temperature: 0,
            }),
          });

          if (updateMemoryResponse.ok) {
            const memoryData = await updateMemoryResponse.json();
            const memoryText = memoryData.choices?.[0]?.message?.content?.trim();
            const memory = JSON.parse(memoryText);

            await supabase.from('customer_memory').upsert({
              store_id: item.store_id,
              customer_email: ticket.customer_email,
              preferred_edition: memory.preferred_edition || customerMemory?.preferred_edition,
              preferred_language: memory.preferred_language || customerMemory?.preferred_language,
              last_sentiment: sentiment,
              notes: memory.notes,
              total_interactions: (customerMemory?.total_interactions || 0) + 1,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'store_id,customer_email',
            });

            console.log(`Item ${item.id} - MEMORY UPDATED:`, memory);
          }
        } catch (memUpdateError) {
          console.error(`Item ${item.id} - Memory update error (non-blocking):`, memUpdateError);
        }

        // ========================================
        // STEP 2d: Marcar como done na fila
        // ========================================
        await supabase
          .from('auto_reply_queue')
          .update({ status: 'done' })
          .eq('id', item.id);

        processedCount++;
        console.log(`Item ${item.id} - ✅ Concluído com sucesso!`);

      } catch (itemError: unknown) {
        failedCount++;
        const errMsg = itemError instanceof Error ? itemError.message : 'Unknown error';
        console.error(`Item ${item.id} - ❌ ERRO:`, errMsg);

        // Marcar como failed
        await supabase
          .from('auto_reply_queue')
          .update({ status: 'failed' })
          .eq('id', item.id);
      }
    }

    console.log(`=== AUTO-REPLY SCHEDULER COMPLETE === Processed: ${processedCount}, Failed: ${failedCount}`);

    return new Response(
      JSON.stringify({ ok: true, processed: processedCount, failed: failedCount }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('=== AUTO-REPLY SCHEDULER ERROR ===', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
