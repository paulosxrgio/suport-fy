import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId, lastMessageContent } = await req.json();

    if (!ticketId) {
      return new Response(
        JSON.stringify({ error: "ticketId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch ticket info
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("subject, customer_name, customer_email, store_id")
      .eq("id", ticketId)
      .single();

    if (ticketError) {
      console.error("Error fetching ticket:", ticketError);
      return new Response(
        JSON.stringify({ error: "Ticket not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch settings
    let openaiApiKey: string | null = null;
    let aiSystemPrompt: string | null = null;
    let aiModel: string | null = null;
    let shopifyStoreUrl: string | null = null;
    let shopifyClientId: string | null = null;
    let shopifyClientSecret: string | null = null;

    if (ticket.store_id) {
      const { data: settings } = await supabase
        .from("settings")
        .select("openai_api_key, ai_system_prompt, ai_model, shopify_store_url, shopify_client_id, shopify_client_secret")
        .eq("store_id", ticket.store_id)
        .maybeSingle();

      if (settings) {
        openaiApiKey = settings.openai_api_key;
        aiSystemPrompt = settings.ai_system_prompt;
        aiModel = settings.ai_model;
        shopifyStoreUrl = (settings as any).shopify_store_url;
        shopifyClientId = (settings as any).shopify_client_id;
        shopifyClientSecret = (settings as any).shopify_client_secret;
      }
    }

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured. Please configure it in AI Agent settings for this store." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch last 5 messages for context
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("content, direction, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch message history" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build history in chronological order with clear roles
    const conversationHistory = messages
      ?.reverse()
      .map((msg) => {
        const role = msg.direction === "inbound" ? "Customer" : "Sophia";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n") || '';

    // ========================================
    // Fetch Shopify orders for context
    // ========================================
    let shopifyContext = '';
    try {
      if (shopifyStoreUrl && shopifyClientId && shopifyClientSecret) {
        const cleanUrl = shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

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

        // Query customer
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
                        nodes { name variantTitle quantity }
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
              shopifyContext = `\n\nDADOS DOS PEDIDOS DO CLIENTE NA SHOPIFY:\n${orders.map((o: any) => `\n- Pedido ${o.order_number} | Status: ${o.status} | Pagamento: ${o.financial_status} | Total: ${o.currency} ${o.total_price}\n  Produtos: ${o.items.map((i: any) => `${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity}`).join(', ')}\n  Rastreamento: ${o.tracking_number ? `${o.tracking_number} via ${o.tracking_company || 'courier'} — https://t.17track.net/${o.tracking_number}` : 'Não disponível ainda'}\n  Situação: ${o.status === 'FULFILLED' ? 'dispatched' : o.status === 'UNFULFILLED' ? 'processed, not yet dispatched' : 'in transit'}`).join('')}`;
            } else {
              shopifyContext = '\n\nDADOS SHOPIFY: Nenhum pedido encontrado para este cliente.';
            }
          }
        }
      }
    } catch (shopifyError) {
      console.log('Shopify fetch skipped in generate-ai-reply:', shopifyError);
    }

    // Extract customer first name
    const customerFirstName = ticket.customer_name?.split(' ')[0] 
      || ticket.customer_email.split('@')[0];

    // Fetch store name for the prompt
    let storeName = 'our store';
    if (ticket.store_id) {
      const { data: storeData } = await supabase
        .from('stores')
        .select('name')
        .eq('id', ticket.store_id)
        .maybeSingle();
      storeName = storeData?.name || 'our store';
    }

    // System prompt
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
CONTINUIDADE DA CONVERSA — REGRA PRINCIPAL
━━━━━━━━━━━━━━━━━━━━━━

Antes de escrever qualquer resposta, leia TODO o histórico da conversa disponível.
Você está continuando uma conversa, não começando uma nova.

LEITURA DO HISTÓRICO:
- Se já foi enviado um link de rastreamento → não mande de novo
- Se o cliente já deu o número do pedido → não peça de novo
- Se já foi explicado que o produto vem da China → não explique de novo
- Se o cliente já disse que é um presente ou tem urgência → lembre disso na resposta atual
- Se o cliente já pediu reembolso antes → não ignore isso na próxima resposta
- Se o cliente ficou satisfeito na mensagem anterior → continue nesse tom
- Se o cliente ficou frustrado → reconheça que já houve uma tentativa anterior de resolver

COMO CONTINUAR NATURALMENTE:
- Use referências ao que foi dito antes: "As I mentioned earlier", "Since we last spoke", "I know you've been waiting since [data]"
- Nunca repita explicações que já foram dadas na mesma conversa
- Se o cliente voltou depois de dias sem resposta, reconheça o tempo: "Thanks for getting back to me" ou "I know it's been a while"
- Se a situação mudou desde a última mensagem, mencione isso: "Good news since we last spoke — the tracking has updated!"

TOM PROGRESSIVO:
- 1ª mensagem → apresente todas as informações necessárias
- 2ª mensagem → só complemente, não repita
- 3ª+ mensagem → seja cada vez mais direta e pessoal, como alguém que já conhece o cliente

MEMÓRIA EMOCIONAL:
- Se o cliente demonstrou ansiedade antes → reconheça que sabe que está sendo difícil para ele
- Se o cliente foi simpático → mantenha esse calor
- Se o cliente foi curto e direto → seja igualmente direta, sem enrolação
- Se o cliente mencionou algo pessoal (presente, viagem, data especial) → mencione de volta: "I hope this arrives in time for [evento]"

EXEMPLO ERRADO (sem memória):
Cliente (3ª mensagem): "Still no sign of my order."
Sophia: "Hi Sarah, thank you for reaching out. I'm sorry to hear that. Your order is in transit. You can track it here: [link]. In general, delivery takes 8–12 business days."

EXEMPLO CERTO (com memória):
Cliente (3ª mensagem): "Still no sign of my order."
Sophia: "Sarah, I completely understand — this has taken much longer than it should, and I'm really sorry. The last update I can see is still showing it in transit. Given how long it's been, I'm escalating this internally and will get back to you with a proper update by tomorrow."

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

    const systemPrompt = aiSystemPrompt || defaultSystemPrompt;

    // Build user message with order context
    const orderContext = shopifyContext && !shopifyContext.includes('Nenhum pedido encontrado')
      ? shopifyContext + `\n- Primeiro nome do cliente: ${customerFirstName}`
      : `\nDADOS DO PEDIDO: Nenhum pedido encontrado. Responda normalmente e peça o número do pedido educadamente no final.\n- Primeiro nome do cliente: ${customerFirstName}`;

    const lastInboundMessage = lastMessageContent || messages?.find(m => m.direction === 'inbound')?.content || '';

    const userMessage = `
${orderContext}

CONVERSATION HISTORY (read carefully before replying — continue naturally from where it left off):
${conversationHistory || 'This is the first message from this customer.'}

CUSTOMER'S LATEST MESSAGE:
${lastInboundMessage || 'No message.'}
`.trim();

    // Call OpenAI
    const model = aiModel || "gpt-4o";
    console.log(`Calling OpenAI API with model: ${model} for store: ${ticket.store_id}`);

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", openaiResponse.status, errorText);
      
      if (openaiResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: "Invalid OpenAI API key. Please check your configuration." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to generate AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const suggestedReply = openaiData.choices?.[0]?.message?.content?.trim();

    if (!suggestedReply) {
      return new Response(
        JSON.stringify({ error: "No response generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI reply generated successfully");

    return new Response(
      JSON.stringify({ reply: suggestedReply }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in generate-ai-reply:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
