import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CEREBRO_PROMPT = `You are the Brain, the silent supervisor of Sophia's email support performance.

ANALYSIS PRINCIPLES:
- One critical error outweighs ten minor ones
- Never repeat corrections already applied in the last 7 days
- Maximum 3 new rules per analysis
- Prioritize: spam engagement (Sophia should NOT engage), wrong language replies, hallucinated order data, missed real customer issues

DO NOT CHANGE in Sophia:
- The spam one-reply policy
- The language auto-detection rule
- The anti-hallucination rules

Respond ONLY in JSON:
{
  "score": 0-10,
  "critical_errors": ["error1"],
  "patterns_found": ["pattern1"],
  "prompt_additions": ["new rule 1"],
  "summary": "2-line summary in English"
}`;

interface BrainAnalysis {
  score: number;
  critical_errors: string[];
  patterns_found: string[];
  prompt_additions: string[];
  summary: string;
}

async function analyzeWithOpenAI(apiKey: string, model: string, userPrompt: string): Promise<BrainAnalysis> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: CEREBRO_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '{}';
  return JSON.parse(text) as BrainAnalysis;
}

async function analyzeWithAnthropic(apiKey: string, model: string, userPrompt: string): Promise<BrainAnalysis> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: CEREBRO_PROMPT + '\n\nIMPORTANT: Output ONLY valid JSON, no prose, no markdown.',
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content?.[0]?.text || '{}').trim();
  // Strip markdown fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  return JSON.parse(clean) as BrainAnalysis;
}

async function analyzeStore(supabase: any, store: any) {
  const storeId = store.id;
  console.log(`[supervisor-agent] Analyzing store ${store.name} (${storeId})`);

  // Load store settings (provider + keys)
  const { data: settings } = await supabase
    .from('settings')
    .select('ai_provider, ai_model, openai_api_key, anthropic_api_key, resend_api_key, sender_email, sender_name')
    .eq('store_id', storeId)
    .maybeSingle();

  if (!settings) {
    return { storeId, skipped: true, reason: 'no_settings' };
  }

  const provider = settings.ai_provider || 'openai';
  const apiKey = provider === 'anthropic' ? settings.anthropic_api_key : settings.openai_api_key;
  if (!apiKey) {
    return { storeId, skipped: true, reason: 'no_api_key' };
  }

  // Last 24h outbound + their inbound counterparts (last 100 messages total)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: msgs } = await supabase
    .from('messages')
    .select('content, direction, created_at, ticket_id')
    .eq('store_id', storeId)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(200);

  const conversationsAnalyzed = msgs ? new Set(msgs.map((m: any) => m.ticket_id)).size : 0;

  if (!msgs || msgs.length === 0) {
    console.log(`[supervisor-agent] Store ${storeId}: no messages in last 24h, skipping`);
    return { storeId, skipped: true, reason: 'no_messages' };
  }

  // Group by ticket
  const byTicket: Record<string, any[]> = {};
  for (const m of msgs) {
    (byTicket[m.ticket_id] ||= []).push(m);
  }

  const conversationsText = Object.entries(byTicket)
    .slice(0, 30)
    .map(([tid, items]) => {
      const lines = items.map((m: any) => `${m.direction === 'inbound' ? 'Customer' : 'Sophia'}: ${m.content}`).join('\n');
      return `--- Ticket ${tid.slice(0, 8)} ---\n${lines}`;
    })
    .join('\n\n');

  // Last 7 reports to avoid repeating rules
  const { data: previousReports } = await supabase
    .from('brain_reports')
    .select('prompt_additions, critical_errors, patterns_found, created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(7);

  const previousRules = (previousReports || [])
    .flatMap((r: any) => (r.prompt_additions as string[]) || [])
    .slice(0, 30);
  const previousErrors = (previousReports || [])
    .flatMap((r: any) => (r.critical_errors as string[]) || [])
    .slice(0, 30);

  const userPrompt = `STORE: ${store.name}
CONVERSATIONS ANALYZED: ${conversationsAnalyzed}
TIME WINDOW: last 24 hours

PREVIOUSLY APPLIED RULES (last 7 reports — do not repeat these):
${previousRules.length ? previousRules.map((r) => `- ${r}`).join('\n') : '(none)'}

PREVIOUSLY DETECTED CRITICAL ERRORS (last 7 reports):
${previousErrors.length ? previousErrors.map((e) => `- ${e}`).join('\n') : '(none)'}

CONVERSATIONS:
${conversationsText}

Analyze and respond in the JSON format defined in your system prompt.`;

  let analysis: BrainAnalysis;
  try {
    analysis = provider === 'anthropic'
      ? await analyzeWithAnthropic(apiKey, settings.ai_model, userPrompt)
      : await analyzeWithOpenAI(apiKey, settings.ai_model, userPrompt);
  } catch (err) {
    console.error(`[supervisor-agent] AI analysis failed for store ${storeId}:`, err);
    return { storeId, skipped: true, reason: 'ai_error', error: String(err) };
  }

  // Sanitize
  const safe = {
    score: typeof analysis.score === 'number' ? Math.max(0, Math.min(10, Math.round(analysis.score))) : 0,
    critical_errors: Array.isArray(analysis.critical_errors) ? analysis.critical_errors.slice(0, 10) : [],
    patterns_found: Array.isArray(analysis.patterns_found) ? analysis.patterns_found.slice(0, 10) : [],
    prompt_additions: Array.isArray(analysis.prompt_additions) ? analysis.prompt_additions.slice(0, 3) : [],
    summary: typeof analysis.summary === 'string' ? analysis.summary.slice(0, 500) : '',
  };

  // Save report
  const { data: inserted, error: insertError } = await supabase
    .from('brain_reports')
    .insert({
      store_id: storeId,
      score: safe.score,
      critical_errors: safe.critical_errors,
      patterns_found: safe.patterns_found,
      prompt_additions: safe.prompt_additions,
      summary: safe.summary,
      conversations_analyzed: conversationsAnalyzed,
    })
    .select()
    .single();

  if (insertError) {
    console.error(`[supervisor-agent] Failed to insert report for ${storeId}:`, insertError);
    return { storeId, skipped: true, reason: 'insert_error' };
  }

  console.log(`[supervisor-agent] Report saved for ${store.name}: score=${safe.score}, critical=${safe.critical_errors.length}`);

  // Email alert if score < 7 OR critical errors > 0
  const shouldAlert = safe.score < 7 || safe.critical_errors.length > 0;
  if (shouldAlert && settings.resend_api_key && settings.sender_email) {
    try {
      const resend = new Resend(settings.resend_api_key);
      const html = `
        <h2>Brain Report — ${store.name}</h2>
        <p><strong>Score:</strong> ${safe.score}/10</p>
        <p><strong>Conversations analyzed:</strong> ${conversationsAnalyzed}</p>
        <p><strong>Summary:</strong> ${safe.summary}</p>
        ${safe.critical_errors.length ? `<h3>Critical errors</h3><ul>${safe.critical_errors.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
        ${safe.patterns_found.length ? `<h3>Patterns found</h3><ul>${safe.patterns_found.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
        ${safe.prompt_additions.length ? `<h3>Suggested rules</h3><ul>${safe.prompt_additions.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
      `;
      await resend.emails.send({
        from: `${settings.sender_name || 'Brain'} <${settings.sender_email}>`,
        to: [settings.sender_email],
        subject: `[Brain] ${store.name} — score ${safe.score}/10${safe.critical_errors.length ? ' ⚠️' : ''}`,
        html,
      });
      console.log(`[supervisor-agent] Alert email sent for ${storeId}`);
    } catch (emailErr) {
      console.error(`[supervisor-agent] Email alert failed for ${storeId}:`, emailErr);
    }
  }

  return { storeId, score: safe.score, conversationsAnalyzed, reportId: inserted.id };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const targetStoreId = body?.store_id || null;

    let storesQuery = supabase.from('stores').select('id, name');
    if (targetStoreId) storesQuery = storesQuery.eq('id', targetStoreId);

    const { data: stores, error: storesError } = await storesQuery;
    if (storesError) throw storesError;

    const results = [];
    for (const store of stores || []) {
      try {
        results.push(await analyzeStore(supabase, store));
      } catch (err) {
        console.error(`[supervisor-agent] Store ${store.id} analysis crashed:`, err);
        results.push({ storeId: store.id, skipped: true, reason: 'crash', error: String(err) });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[supervisor-agent] FATAL:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
