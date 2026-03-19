import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { store_id, ticket_id, customer_email, customer_message, ai_response, sentiment, openai_api_key, anthropic_api_key, ai_provider } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const analysisPrompt = `You are a quality analyst for customer support AI responses.

Analyze this AI response and return ONLY valid JSON, no markdown:
{
  "score": number from 0 to 100,
  "issues": ["list of problems found"],
  "positive_aspects": ["list of things done well"]
}

Scoring criteria:
- Starts with varied opening (not always "Hi [Name], Thank you for reaching out") → +15
- Uses customer's first name correctly → +10
- Appropriate length for the situation → +10
- No forbidden phrases ("I hope this message finds you well", "I would be more than happy") → +10
- No markdown formatting in response → +10
- Tracking link is plain URL not markdown → +10
- Does not repeat information already given in conversation → +10
- Tone matches customer sentiment (frustrated = empathetic, happy = concise) → +10
- Does not mention product name directly → +5
- Natural human feel, not robotic → +10

Deduct points for each issue found.

Customer message: ${customer_message}
Customer sentiment: ${sentiment}
AI response: ${ai_response}`;

    let analysisResult = { score: 70, issues: [] as string[], positive_aspects: [] as string[] };

    try {
      const useAnthropic = ai_provider === 'anthropic' && anthropic_api_key;

      if (useAnthropic) {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropic_api_key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: analysisPrompt }],
          }),
        });
        const data = await res.json();
        analysisResult = JSON.parse(data.content?.[0]?.text?.trim());
      } else {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openai_api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: analysisPrompt }],
            max_tokens: 300,
            temperature: 0,
          }),
        });
        const data = await res.json();
        analysisResult = JSON.parse(data.choices?.[0]?.message?.content?.trim());
      }
    } catch (e) {
      console.error('Analysis parse error:', e);
    }

    await supabase.from('response_quality_log').insert({
      store_id,
      ticket_id,
      customer_email,
      customer_message,
      ai_response,
      sentiment,
      score: analysisResult.score,
      issues: analysisResult.issues,
      positive_aspects: analysisResult.positive_aspects,
    });

    console.log(`QUALITY SCORE: ${analysisResult.score}/100 | Issues: ${analysisResult.issues.length}`);

    return new Response(JSON.stringify({ ok: true, score: analysisResult.score }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
