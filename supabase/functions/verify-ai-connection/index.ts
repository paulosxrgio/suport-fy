import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { provider, api_key, model } = await req.json();

    if (!api_key) {
      return new Response(
        JSON.stringify({ success: false, error: 'API key não informada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
      });

      if (res.ok) {
        return new Response(
          JSON.stringify({ success: true, message: 'OpenAI conectada com sucesso!' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const error = await res.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ success: false, error: error?.error?.message || 'API Key inválida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': api_key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: model || 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (res.ok) {
        return new Response(
          JSON.stringify({ success: true, message: 'Anthropic Claude conectado com sucesso!' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const error = await res.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ success: false, error: error?.error?.message || 'API Key inválida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Provedor não reconhecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
