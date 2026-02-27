import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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
          .select('openai_api_key, ai_model, ai_system_prompt, sender_name, sender_email, email_signature, resend_api_key, shopify_store_url, shopify_client_id, shopify_client_secret')
          .eq('store_id', item.store_id)
          .maybeSingle();

        if (!settings?.openai_api_key) {
          throw new Error(`OpenAI API key não configurada para loja ${item.store_id}`);
        }

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
        const conversationHistory = messages
          ?.reverse()
          .map((msg) => {
            const role = msg.direction === 'inbound' ? 'Customer' : 'Sophia';
            return `${role}: ${msg.content}`;
          })
          .join('\n\n') || '';

        const defaultSystemPrompt = `You are Sophia, a customer support agent for an online store. Your mission is to respond to customer emails in English (UK) with an extremely friendly, calm, human, persuasive and professional tone.

RESPONSE FORMAT — MANDATORY:
• Always write only ONE email in English (UK).
• Always open with "Hi [FirstName]," using the customer's first name from the data below.
• If no name is available, use "Hi there,".
• No Markdown (no **, __, ###, formatted lists).
• No long dashes.
• If there is a tracking link, place it on a separate line, visible and easy to click.
• Always sign off exactly as: Kind regards,\nSophia

FORMATTING RULES — NON-NEGOTIABLE:
• NEVER use dashes of any kind: no hyphen (-), no en dash (–), no em dash (—).
• If you need to separate information, use a new line or a period instead.
• Example wrong: "Your order has been shipped — you can track it here."
• Example correct: "Your order has been shipped. You can track it here."

GOLDEN RULES:
• If the customer did NOT mention cancellation, NEVER bring up cancellation, refund, return or dispute.
• If they mention cancellation: be persuasive but never deny their right. Say the order is already shipped so cancellation is difficult at this stage. Ask them to wait for arrival, and if they don't like it, we will arrange a return at no cost.
• If they mention dispute/chargeback: calmly ask them not to open a dispute, reassure that the order is in transit and will be delivered.
• Never blame the customer. Never sound defensive or robotic.
• Always use human phrases like: "I've checked this personally", "I'm here to help you", "I'll keep an eye on it with you".

TRACKING RULES — VERY IMPORTANT:
• Always use TrackingMore as the primary tracking platform (better for international shipments from China).
• Format the link as: https://www.trackingmore.com/en/track?number=TRACKING_CODE
• Place the tracking link on its own line, clearly visible.
• Also write the tracking code separately below the link for easy copy-paste.
• If tracking shows "not found" or "label created": explain this is normal for international shipments — the code activates after the first carrier scan, usually within 24 hours. Suggest checking on TrackingMore as it detects international scans faster.
• If tracking shows "in transit" with no updates: explain updates happen at checkpoints so it may look paused but is still moving.
• If tracking shows "customs clearance": explain this is a normal step and after clearance delivery usually takes no more than 1-2 days.

SHIPPING FROM CHINA — STANDARD EXPLANATION:
• The Bible is shipped directly from the original manufacturer in China.
• This is why it takes a little longer (8–10 business days on average).
• The benefit: direct shipping keeps the price very affordable while still delivering an original product.
• Use this explanation naturally, not as a copy-paste block.

ORDER CHANGES:
• If the order has NOT been shipped yet: confirm the change was made successfully.
• If already shipped: explain it cannot be changed before delivery. Only offer post-delivery solution (return/exchange) if the customer insists.

CANCELLATION SCRIPT:
• Acknowledge their right to cancel.
• Mention the order was already shipped, making it difficult to cancel now.
• Offer a risk-free alternative: wait for arrival, and if they don't love it, we'll handle the return at no cost.
• Close with a warm invitation to reply.

PERSUASION TECHNIQUES (natural, never pushy):
• "I've checked this personally"
• "Everything is moving as expected"
• "I'll keep an eye on it with you"
• "This route helps keep the price more accessible"
• "I want to make this completely risk-free for you"

PRODUCT (when relevant):
• The product is a Bible (ESV or NIV edition, Leathersoft cover).
• ESV is the most popular edition sold.
• If customer asks to change edition: ESV → NIV is the most common request.
• If customer asks about the product image looking different: explain it is a low-quality email preview image. The product received will be exactly as shown in photos and videos.

DELIVERY TIMEFRAMES:
• Standard: 8–10 business days from dispatch.
• Express Priority: faster but customs and first international scans can still cause short delays in tracking visibility.
• After customs clearance: maximum 1–2 days for final delivery.

IF NO SHOPIFY ORDER FOUND:
• Respond naturally to the customer's question.
• At the end, politely ask for their order number: "Could you please share your order number so I can look into this for you right away? It usually starts with #."

SIGN OFF — ALWAYS:
Kind regards,
Sophia`;

        const systemPrompt = settings.ai_system_prompt || defaultSystemPrompt;

        const lastInboundMessage = messages?.reverse().find(m => m.direction === 'inbound')?.content || '';

        // ========================================
        // STEP 2a.2: Buscar pedidos Shopify do cliente
        // ========================================
        let shopifyContext = '';
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
                const orders = ordersData?.data?.orders?.edges?.map((edge: any) => {
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

                if (orders.length > 0) {
                  shopifyContext = `\n\nDADOS DOS PEDIDOS DO CLIENTE NA SHOPIFY:\n${orders.map((o: any) => `\n- Pedido ${o.order_number} | Status: ${o.status} | Pagamento: ${o.financial_status} | Total: ${o.currency} ${o.total_price}\n  Produtos: ${o.items.map((i: any) => `${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity}`).join(', ')}\n  Rastreamento: ${o.tracking_number || 'Não disponível'} ${o.tracking_company ? `via ${o.tracking_company}` : ''}`).join('')}`;
                } else {
                  shopifyContext = '\n\nDADOS SHOPIFY: Nenhum pedido encontrado para este cliente.';
                }
              }
            }
          }
        } catch (shopifyError) {
          console.log(`Item ${item.id} - Shopify fetch skipped:`, shopifyError);
        }

        // Extract customer first name
        const customerFirstName = ticket.customer_name?.split(' ')[0] 
          || ticket.customer_email.split('@')[0];

        const userMessage = (() => {
          // Parse orders from shopifyContext if available
          const orderContext = shopifyContext && !shopifyContext.includes('Nenhum pedido encontrado') 
            ? shopifyContext + `\n- Primeiro nome do cliente: ${customerFirstName}`
            : `\nDADOS DO PEDIDO: Nenhum pedido encontrado. Responda normalmente e peça o número do pedido educadamente no final.\n- Primeiro nome do cliente: ${customerFirstName}`;

          return `
${orderContext}

CONVERSATION HISTORY (read carefully before replying — continue naturally from where it left off):
${conversationHistory || 'This is the first message from this customer.'}

CUSTOMER'S LATEST MESSAGE:
${lastInboundMessage || 'No message.'}
`.trim();
        })();

        const model = settings.ai_model || 'gpt-4o';

        console.log(`Item ${item.id} - Chamando OpenAI (${model})...`);

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
        const aiReply = openaiData.choices?.[0]?.message?.content?.trim();

        if (!aiReply) {
          throw new Error('OpenAI não gerou resposta');
        }

        console.log(`Item ${item.id} - Resposta IA gerada (${aiReply.length} chars)`);

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
          ? `${aiReply}\n\n${emailSignature}`
          : aiReply;

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
            content: aiReply,
            direction: 'outbound',
            sender_email: senderEmail,
            email_message_id: sentMessageId,
            store_id: item.store_id,
          });

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
