import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getShopifyToken(storeUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`https://${storeUrl}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Shopify auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { ticketId } = await req.json();
    if (!ticketId) {
      return new Response(JSON.stringify({ error: 'ticketId é obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('tickets')
      .select('customer_email, store_id')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket não encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ticket.store_id) {
      return new Response(JSON.stringify({ orders: [], not_configured: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('shopify_store_url, shopify_client_id, shopify_client_secret')
      .eq('store_id', ticket.store_id)
      .single();

    const shopifyUrl = (settings as any)?.shopify_store_url;
    const clientId = (settings as any)?.shopify_client_id;
    const clientSecret = (settings as any)?.shopify_client_secret;

    if (!shopifyUrl || !clientId || !clientSecret) {
      return new Response(JSON.stringify({ orders: [], not_configured: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanUrl = shopifyUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    console.log('SHOPIFY DEBUG - Store URL:', cleanUrl);
    console.log('SHOPIFY DEBUG - Customer email:', ticket.customer_email);
    console.log('SHOPIFY DEBUG - Gerando token...');

    // Get token via client credentials
    const accessToken = await getShopifyToken(cleanUrl, clientId, clientSecret);
    console.log('SHOPIFY DEBUG - Token gerado:', accessToken ? 'OK' : 'VAZIO');

    const graphqlQuery = `
      {
        orders(first: 5, query: "email:\\"${ticket.customer_email}\\"") {
          edges {
            node {
              name
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet { shopMoney { amount currencyCode } }
              createdAt
              lineItems(first: 10) {
                edges {
                  node {
                    name
                    variantTitle
                    quantity
                    originalUnitPriceSet { shopMoney { amount } }
                  }
                }
              }
              fulfillments {
                trackingInfo { number url company }
              }
            }
          }
        }
      }
    `;

    const graphqlUrl = `https://${cleanUrl}/admin/api/2025-01/graphql.json`;
    console.log('SHOPIFY DEBUG - GraphQL URL:', graphqlUrl);

    const shopifyResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });

    console.log('SHOPIFY DEBUG - Status da resposta:', shopifyResponse.status);

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('SHOPIFY DEBUG - Erro body:', errorText);
      return new Response(JSON.stringify({ orders: [], error: `Shopify API error: ${shopifyResponse.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const responseData = await shopifyResponse.json();
    console.log('SHOPIFY DEBUG - Resposta completa:', JSON.stringify(responseData));

    if (responseData.errors) {
      console.error('SHOPIFY DEBUG - GraphQL errors:', JSON.stringify(responseData.errors));
      return new Response(JSON.stringify({ orders: [], error: `GraphQL errors: ${JSON.stringify(responseData.errors)}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orders = responseData.data?.orders?.edges?.map(({ node: order }: any) => ({
      order_number: order.name,
      status: order.displayFulfillmentStatus,
      financial_status: order.displayFinancialStatus,
      total_price: order.totalPriceSet?.shopMoney?.amount,
      currency: order.totalPriceSet?.shopMoney?.currencyCode,
      created_at: order.createdAt,
      tracking_number: order.fulfillments?.[0]?.trackingInfo?.[0]?.number || null,
      tracking_company: order.fulfillments?.[0]?.trackingInfo?.[0]?.company || null,
      tracking_url: order.fulfillments?.[0]?.trackingInfo?.[0]?.url || null,
      items: order.lineItems?.edges?.map(({ node: item }: any) => ({
        name: item.name,
        variant: item.variantTitle,
        quantity: item.quantity,
        price: item.originalUnitPriceSet?.shopMoney?.amount,
      })) || [],
    })) || [];
    console.log('SHOPIFY DEBUG - Quantidade de pedidos:', orders.length);

    return new Response(JSON.stringify({ orders }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
