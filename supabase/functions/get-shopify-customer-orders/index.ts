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

    // Get token via client credentials
    const accessToken = await getShopifyToken(cleanUrl, clientId, clientSecret);

    const encodedEmail = encodeURIComponent(ticket.customer_email);
    const shopifyApiUrl = `https://${cleanUrl}/admin/api/2024-01/orders.json?email=${encodedEmail}&status=any&limit=5`;

    const shopifyResponse = await fetch(shopifyApiUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!shopifyResponse.ok) {
      console.error('Shopify API error:', shopifyResponse.status);
      return new Response(JSON.stringify({ orders: [], error: `Shopify API error: ${shopifyResponse.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopifyData = await shopifyResponse.json();
    const orders = (shopifyData.orders || []).map((order: any) => ({
      order_number: order.order_number,
      status: order.fulfillment_status || 'unfulfilled',
      financial_status: order.financial_status,
      total_price: order.total_price,
      currency: order.currency,
      created_at: order.created_at,
      tracking_number: order.fulfillments?.[0]?.tracking_number || null,
      tracking_company: order.fulfillments?.[0]?.tracking_company || null,
      tracking_url: order.fulfillments?.[0]?.tracking_url || null,
      items: (order.line_items || []).map((item: any) => ({
        name: item.name,
        variant: item.variant_title,
        quantity: item.quantity,
        price: item.price,
      })),
    }));

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
