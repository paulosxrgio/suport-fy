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

        // Buscar últimas 3 mensagens para contexto
        const { data: messages } = await supabase
          .from('messages')
          .select('content, direction, created_at')
          .eq('ticket_id', item.ticket_id)
          .order('created_at', { ascending: false })
          .limit(3);

        const conversationHistory = messages
          ?.reverse()
          .map((msg) => {
            const role = msg.direction === 'inbound' ? 'Cliente' : 'Atendente';
            return `${role}: ${msg.content}`;
          })
          .join('\n\n') || '';

        const defaultSystemPrompt = `Você é um assistente de suporte ao cliente profissional e amigável. 
Responda de forma clara, educada e útil. Mantenha as respostas concisas mas completas.`;

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

            const customerQuery = `
              query($q: String!) {
                customers(first: 1, query: $q) {
                  nodes {
                    firstName
                    lastName
                    numberOfOrders
                    amountSpent { amount currencyCode }
                    orders(first: 5, sortKey: CREATED_AT, reverse: true) {
                      nodes {
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
              }
            `;

            const shopifyResponse = await fetch(`https://${cleanUrl}/admin/api/2025-01/graphql.json`, {
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

            if (shopifyResponse.ok) {
              const responseData = await shopifyResponse.json();
              if (!responseData.errors) {
                const customer = responseData.data?.customers?.nodes?.[0];
                const orders = customer?.orders?.nodes?.map((order: any) => ({
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
                })) || [];

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

        const userMessage = `Contexto do Ticket:
- Assunto: ${ticket.subject}
- Cliente: ${ticket.customer_name || ticket.customer_email}

Histórico da Conversa:
${conversationHistory || "Nenhuma mensagem anterior."}
${shopifyContext}

${lastInboundMessage ? `Última mensagem do cliente: ${lastInboundMessage}` : ""}

Por favor, gere uma resposta profissional e útil para o cliente.`;

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
