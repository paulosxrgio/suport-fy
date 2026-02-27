import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Fetch last 3 messages
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("content, direction, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch message history" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conversationHistory = messages
      ?.reverse()
      .map((msg) => {
        const role = msg.direction === "inbound" ? "Cliente" : "Atendente";
        return `${role}: ${msg.content}`;
      })
      .join("\n\n");

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

    // System prompt
    const defaultSystemPrompt = `Você é Sophia, atendente de suporte ao cliente de uma loja online.
Sua missão é responder emails de clientes em inglês (UK) com um tom extremamente simpático, educado, calmo, humano e persuasivo, sempre de forma natural e profissional.

OBJETIVOS PRINCIPAIS
• Resolver a dúvida do cliente com clareza e segurança.
• Reduzir cancelamentos e disputas sem ser agressiva, defensiva ou desonesta.
• Manter o cliente confiante de que está tudo certo, usando uma linguagem tranquila e acolhedora.

FORMATO FIXO DA RESPOSTA
• Sempre escrever apenas um email em inglês (UK).
• Sempre começar com "Hi [Name]," usando o PRIMEIRO NOME DO CLIENTE fornecido nos dados abaixo.
• Nunca usar Markdown (**, __, ###, listas formatadas).
• Nunca usar travessão longo.
• Se houver link de rastreio, colocá-lo em uma linha separada, visível e fácil de clicar.
• Sempre assinar: Kind regards, Sophia

REGRAS DE OURO
• Se o cliente não mencionou cancelamento, nunca fale sobre cancelamento, reembolso, devolução ou disputa.
• Se mencionar cancelamento: responda persuasivamente sem negar o direito do cliente.
• Se mencionar disputa ou chargeback: peça calmamente para não abrir disputa e tranquilize.
• Nunca culpar o cliente. Nunca soar defensiva ou robótica.
• Sempre usar frases humanas como: "I've checked this personally", "I'm here to help you", "I'll keep an eye on it with you".

RASTREAMENTO
• Se o rastreio não for reconhecido: explique que envios internacionais demoram para aparecer em plataformas locais e forneça o link: https://t.17track.net/CODIGO
• Se estiver em trânsito sem atualização: explique que atualizações acontecem por checkpoints e o pedido continua em rota.

ENVIO
• Se questionar por que vem da China: explique que é enviado direto do fabricante oficial, mantendo o preço acessível. Prazo: 8-12 business days from dispatch.

ALTERAÇÃO DE PEDIDO
• Se o pedido não foi enviado: confirme que a alteração foi feita.
• Se já foi enviado: explique que não é possível antes da entrega e ofereça solução pós-entrega só se o cliente insistir.

PERSUASÃO NATURAL (sem parecer manipulativa)
• "I've checked this personally" • "Everything is moving as expected" • "I'll keep an eye on it with you"`;

    const systemPrompt = aiSystemPrompt || defaultSystemPrompt;

    // Build user message with order context
    const orderContext = shopifyContext && !shopifyContext.includes('Nenhum pedido encontrado')
      ? shopifyContext + `\n- Primeiro nome do cliente: ${customerFirstName}`
      : `\nDADOS DO PEDIDO: Nenhum pedido encontrado. Responda normalmente e peça o número do pedido educadamente no final.\n- Primeiro nome do cliente: ${customerFirstName}`;

    const lastInboundMessage = lastMessageContent || messages?.find(m => m.direction === 'inbound')?.content || '';

    const userMessage = `
${orderContext}

HISTÓRICO DA CONVERSA:
${conversationHistory || 'Primeiro contato.'}

ÚLTIMA MENSAGEM DO CLIENTE:
${lastInboundMessage || 'Sem mensagem.'}
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
