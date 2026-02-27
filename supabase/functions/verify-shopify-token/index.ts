import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { storeUrl, apiToken } = await req.json();

    if (!storeUrl || !apiToken) {
      return new Response(JSON.stringify({ success: false, error: 'URL e token são obrigatórios' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!apiToken.startsWith('shpat_')) {
      return new Response(JSON.stringify({ success: false, error: 'Token inválido. O token da Shopify Admin API deve começar com shpat_' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize the store URL
    const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const shopifyApiUrl = `https://${cleanUrl}/admin/api/2024-01/shop.json`;

    const response = await fetch(shopifyApiUrl, {
      headers: {
        'X-Shopify-Access-Token': apiToken,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const shopName = data.shop?.name || cleanUrl;
      return new Response(JSON.stringify({ success: true, message: `Conexão válida! Loja: ${shopName}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (response.status === 401 || response.status === 403) {
      return new Response(JSON.stringify({ success: false, error: 'Token inválido ou sem permissão' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: `Erro ao conectar (HTTP ${response.status}). Verifique a URL da loja.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: 'Erro ao verificar conexão com Shopify' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
