import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: stores } = await supabase
      .from('stores')
      .select('id, name');

    if (!stores?.length) {
      return new Response(JSON.stringify({ ok: true, message: 'No stores found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let totalOptimized = 0;

    for (const store of stores) {
      try {
        const { data: settings } = await supabase
          .from('settings')
          .select('openai_api_key, anthropic_api_key, ai_provider, ai_system_prompt, prompt_version')
          .eq('store_id', store.id)
          .maybeSingle();

        if (!settings?.openai_api_key && !settings?.anthropic_api_key) continue;

        const { data: logs } = await supabase
          .from('response_quality_log')
          .select('score, issues, positive_aspects, customer_message, ai_response')
          .eq('store_id', store.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!logs || logs.length < 10) {
          console.log(`Store ${store.id}: not enough data (${logs?.length || 0} logs)`);
          continue;
        }

        const avgScore = Math.round(logs.reduce((a, l) => a + (l.score || 0), 0) / logs.length);

        if (avgScore >= 80) {
          console.log(`Store ${store.id}: avg score ${avgScore} — no optimization needed`);
          continue;
        }

        const { data: pendingSuggestion } = await supabase
          .from('prompt_suggestions')
          .select('id')
          .eq('store_id', store.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (pendingSuggestion) {
          console.log(`Store ${store.id}: already has pending suggestion`);
          continue;
        }

        const allIssues: string[] = logs.flatMap(l => (l.issues as string[]) || []);
        const issueCounts: Record<string, number> = {};
        allIssues.forEach(issue => {
          issueCounts[issue] = (issueCounts[issue] || 0) + 1;
        });
        const topIssues = Object.entries(issueCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([issue, count]) => `"${issue}" (appeared ${count} times)`);

        const badExamples = logs
          .filter(l => (l.score || 0) < 60)
          .slice(0, 3)
          .map(l => `Customer: ${l.customer_message?.slice(0, 200)}\nAI: ${l.ai_response?.slice(0, 300)}`);

        const currentPrompt = settings.ai_system_prompt || 'Default system prompt (no custom prompt set)';

        const optimizationPrompt = `You are an AI prompt engineer specializing in customer support.

Analyze the quality issues below and improve the system prompt to fix them.

CURRENT AVERAGE SCORE: ${avgScore}/100
RESPONSES ANALYZED: ${logs.length}

TOP RECURRING ISSUES:
${topIssues.join('\n')}

EXAMPLES OF LOW-QUALITY RESPONSES:
${badExamples.join('\n\n---\n\n')}

CURRENT SYSTEM PROMPT:
${currentPrompt.slice(0, 3000)}

Based on the issues above, generate an IMPROVED version of the system prompt that specifically addresses these problems.
Focus ONLY on fixing the recurring issues. Keep all existing rules that are working well.
Return ONLY valid JSON, no markdown:
{
  "suggested_prompt": "the complete improved system prompt",
  "changes_made": ["list of specific changes made and why"],
  "expected_improvement": "brief description of expected score improvement"
}`;

        const useAnthropic = settings.ai_provider === 'anthropic' && settings.anthropic_api_key;
        let suggestion: { suggested_prompt?: string; changes_made?: string[]; expected_improvement?: string } | null = null;

        if (useAnthropic) {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': settings.anthropic_api_key!,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 4000,
              messages: [{ role: 'user', content: optimizationPrompt }],
            }),
          });
          const data = await res.json();
          suggestion = JSON.parse(data.content?.[0]?.text?.trim());
        } else {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.openai_api_key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [{ role: 'user', content: optimizationPrompt }],
              max_tokens: 4000,
              temperature: 0.3,
            }),
          });
          const data = await res.json();
          suggestion = JSON.parse(data.choices?.[0]?.message?.content?.trim());
        }

        if (suggestion?.suggested_prompt) {
          await supabase.from('prompt_suggestions').insert({
            store_id: store.id,
            current_prompt: currentPrompt,
            suggested_prompt: suggestion.suggested_prompt,
            reason: suggestion.expected_improvement,
            issues_found: suggestion.changes_made || topIssues,
            avg_score_before: avgScore,
            responses_analyzed: logs.length,
            status: 'pending',
          });

          console.log(`Store ${store.id} (${store.name}): suggestion created! Avg score was ${avgScore}`);
          totalOptimized++;
        }

      } catch (storeError) {
        console.error(`Error processing store ${store.id}:`, storeError);
      }
    }

    return new Response(JSON.stringify({ ok: true, stores_optimized: totalOptimized }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
