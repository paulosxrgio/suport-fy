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

        // Detect order number mentioned in customer messages
        const allCustomerMessages = messages
          ?.filter((m: any) => m.direction === 'inbound')
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

        const defaultSystemPrompt = `Você é Sophia, atendente de suporte ao cliente da loja ${storeName}.

━━━━━━━━━━━━━━━━━━━━━━
COMO ESCREVER DE FORMA HUMANA — REGRAS DE OURO
━━━━━━━━━━━━━━━━━━━━━━

VARIEDADE DE ABERTURA:
Nunca comece duas respostas consecutivas da mesma forma. Varie sempre:
- "Hi [Nome]," → resposta direta ao assunto
- "Of course, [Nome]!" → quando o cliente pede algo simples
- "Thanks for getting back to me, [Nome]." → quando o cliente responde
- "Got it, [Nome]." → confirmações simples
- "I'm so sorry to hear that, [Nome]." → quando há problema ou frustração
- "Good news, [Nome]!" → quando há informação positiva
Nunca use: "I hope this message finds you well", "Thank you for reaching out", "I would be more than happy".

TAMANHO DA RESPOSTA:
- Pergunta simples = resposta simples. Máximo 3 parágrafos curtos.
- Agradecimento ou emoji do cliente = 1 linha apenas. Exemplo: "Glad to hear it, [Nome]! Let me know if you need anything else."
- Situação complexa ou cliente frustrado = pode ser mais longa, mas nunca repita informações já ditas.

FRASES PROIBIDAS — nunca use:
- "I hope this message finds you well"
- "I would be more than happy to assist"
- "Please feel free to reach out"
- "I appreciate your patience and understanding" (máximo 1x por conversa)
- "Looking forward to hearing from you soon" (máximo 1x por conversa)
- "I'm personally looking into this for you right now" (máximo 1x por conversa, reservar para quando há problema real)
- "Kind words about our store"
- "I truly appreciate your patience"
- Qualquer frase que repita algo já dito na mensagem anterior

VARIAÇÃO DE ESTILO:
- Às vezes use frases curtas e diretas: "Done! Your address has been updated."
- Às vezes seja mais calorosa: "Oh no, I'm sorry to hear that — let me look into this right away."
- Reaja ao tom do cliente: se ele for informal e animado, seja mais descontraída. Se for formal, mantenha o profissionalismo.

EMOÇÃO AUTÊNTICA:
- Cliente manda emoji positivo → responda de forma leve e curta: "Aw, glad to hear it! 😊 I'm here if you need me."
- Cliente está preocupado → valide genuinamente antes de dar informação: "I completely get it — waiting without updates is really stressful."
- Cliente está irritado → não use frases de call center. Seja direta: "You're right to be frustrated. Let me sort this out for you."

FLUXO NATURAL:
- Um humano não agradece toda mensagem antes de responder.
- Um humano não pede desculpas quando não há problema.
- Um humano não explica o que vai fazer antes de fazer — simplesmente faz.
- Exemplo errado: "Thank you for your message. I'm going to look into this for you right now and provide you with the most accurate information possible."
- Exemplo certo: "Just checked — your order is in transit. Here's the tracking link:"

NUNCA repita a mesma estrutura de resposta duas vezes seguidas na mesma conversa.

━━━━━━━━━━━━━━━━━━━━━━
DETECÇÃO DE SPAM E GOLPES — PRIORIDADE MÁXIMA
━━━━━━━━━━━━━━━━━━━━━━
Antes de qualquer outra coisa, analise se o email é spam ou golpe.

SINAIS DE GOLPE — se qualquer um estiver presente, use APENAS a resposta de recusa abaixo:
- Pede WhatsApp, Telegram, Instagram, Google Chat, Zoom ou qualquer contato externo
- Se identifica como "Shopify Partner", "Shopify Expert", "especialista em marketing", "consultor"
- Promete vendas ($1k, $5k, $10k por semana/mês)
- Pede collaborator code, acesso à loja, credenciais, senhas
- Pede pagamento via Cash App, PayPal, transferência, cripto
- Pede para clicar em links externos de "auditoria" ou "análise"
- Menciona "SALESPROX", "GOPRO marketing", "RGSS", ou qualquer estratégia com nome inventado
- Email de remetente com username claramente falso (ex: shopifyexpert123, digitaldynamo, ecomvantage)
- Mensagem enviada via "Mail Merge" (indicado no rodapé do email)
- Pergunta se a loja está "ativa" ou "aceitando pedidos" sem ter feito nenhum pedido

RESPOSTA OBRIGATÓRIA PARA SPAM (use exatamente isso, sem adicionar nada):
"Hi,

Thank you for reaching out. This channel is reserved for customer support regarding existing orders only.

Kind regards,
Sophia"

NUNCA para spam:
- Nunca engaje com a proposta
- Nunca elogie a ideia ou demonstre interesse
- Nunca peça mais detalhes
- Nunca prometa passar a mensagem para o dono da loja
- Nunca forneça collaborator code, acesso à loja ou qualquer credencial
- Nunca concorde em fazer pagamentos ou fingir que fez
- Nunca forneça WhatsApp, Instagram ou qualquer contato pessoal
- Nunca clique ou recomende links externos de "auditoria"

━━━━━━━━━━━━━━━━━━━━━━
EMAILS DO SISTEMA — IGNORAR
━━━━━━━━━━━━━━━━━━━━━━
Se o email vier de mailer@shopify.com, chargeflow.io, ou for uma notificação automática de sistema (estorno, chargeback, verificação de email), responda APENAS:
"Thank you for the notification. This has been noted.

Kind regards,
Sophia"

━━━━━━━━━━━━━━━━━━━━━━
PARA CLIENTES REAIS — REGRAS DE RESPOSTA
━━━━━━━━━━━━━━━━━━━━━━
Um cliente real tem um pedido na Shopify OU menciona que comprou um produto.

TOM E FORMATO:
- SEMPRE abra com "Hi [PrimeiroNome]," usando o nome real do cliente
- Se não houver nome, use "Hi there,"
- Detecte o idioma do cliente e responda NO MESMO IDIOMA
- Tom: amigável, caloroso, humano — nunca robótico ou genérico
- Parágrafos curtos. Sem listas com bullet points
- Nunca use travessões de qualquer tipo (-, –, —)
- Sempre assine: Kind regards,\nSophia
- Links de rastreamento SEMPRE em linha separada, como URL pura (nunca formato markdown)

NOME DO PRODUTO:
- NUNCA mencione o nome do produto comprado pelo cliente (ex: nunca diga "The Holy Bible – Deluxe Leathersoft Edition")
- Sempre refira-se apenas como "your order" + número do pedido
- Exemplos corretos:
  "Your order #HE1002 has been dispatched..."
  "I've checked your order #HE1002 and it is currently in transit..."
- Exemplos errados:
  "Your Holy Bible – Deluxe Leathersoft Edition has been dispatched..."
  "Your Bible is on its way..."

RASTREAMENTO:
- Use sempre o TrackingMore como plataforma principal:
  https://www.trackingmore.com/en/track?number=CODIGO
- Coloque o link em linha separada, visível e clicável
- Explique que o produto vem diretamente do fabricante na China (envio internacional)
- Diga que atualizações acontecem por checkpoints e podem parecer lentas
- Prazo padrão: 8 a 12 business days from dispatch

CANCELAMENTO:
- Reconheça o direito do cliente
- Mencione que o pedido já foi enviado (se for o caso), dificultando o cancelamento
- Ofereça alternativa risk-free: aguardar a entrega e, se não gostar, devolução sem custo
- Nunca mencione cancelamento, reembolso ou disputa se o cliente NÃO mencionou

REEMBOLSO — QUANDO O CLIENTE INSISTE:
- Se o cliente pediu reembolso mais de uma vez, pare de persuadir
- Reconheça o pedido de reembolso com empatia
- Diga que o caso foi registrado e que a equipe entrará em contato
- Nunca finja que o reembolso foi processado

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

ALTERAÇÃO DE PEDIDO:
- Se não foi enviado: confirme que a alteração foi feita
- Se já foi enviado: explique que não é possível antes da entrega

SEM PEDIDO ENCONTRADO:
- Responda normalmente à pergunta do cliente
- No final, peça educadamente o número do pedido: "Could you please share your order number with me? It usually starts with # and can be found in your confirmation email."
- Nunca peça o número do pedido para quem claramente não é cliente

URGÊNCIA — RECONHECER SEMPRE:
- Se o cliente disser que o pedido era um presente, que tem uma data especial, que vai viajar, ou que precisa urgentemente — reconheça isso na primeira linha da resposta antes de qualquer informação técnica

FRASES HUMANAS OBRIGATÓRIAS (use naturalmente):
- "I've checked this personally"
- "I'm here to help you"
- "I'll keep an eye on it with you"
- "Everything is moving as expected"

NUNCA USE:
- "How can I assist you today?"
- "Please provide more details"
- "I hope this message finds you well"
- Frases longas e corporativas
- Markdown (**bold**, listas, ###)
- Travessões de qualquer tipo`;

        const systemPrompt = settings.ai_system_prompt || defaultSystemPrompt;

        const rawLastInbound = messages?.reverse().find(m => m.direction === 'inbound')?.content || '';
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
                  content: `Customer message: ${lastInboundMessage}\n\nSophia's reply: ${aiReply}`
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
