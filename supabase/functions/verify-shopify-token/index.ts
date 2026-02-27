import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { storeUrl, clientId, clientSecret } = await req.json();

    if (!storeUrl || !clientId || !clientSecret) {
      return new Response(JSON.stringify({ success: false, error: 'URL, Client ID e Client Secret são obrigatórios' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Step 1: Get token via client credentials
    let accessToken: string;
    try {
      accessToken = await getShopifyToken(cleanUrl, clientId, clientSecret);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'Falha na autenticação. Verifique Client ID e Client Secret.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Test the token
    const shopifyApiUrl = `https://${cleanUrl}/admin/api/2024-01/shop.json`;
    const response = await fetch(shopifyApiUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const shopName = data.shop?.name || cleanUrl;
      return new Response(JSON.stringify({ success: true, message: `Conexão válida! Loja: ${shopName}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: `Erro ao conectar (HTTP ${response.status}). Verifique as credenciais.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: 'Erro ao verificar conexão com Shopify' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
