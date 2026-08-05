// Anti-loop guard: detects automated emails, own-store senders, echoes and
// no-progress loops BEFORE any AI call is made (saves tokens).
import { stripQuotedText } from "./strip-quoted.ts";


export interface AntiLoopHeader {
  name?: string;
  value?: string;
}

export interface AntiLoopMessage {
  content: string;
  direction: string;
  created_at?: string;
}

export interface AntiLoopInput {
  inboundContent: string;
  inboundSenderEmail: string | null | undefined;
  headers: unknown;
  storeSenderEmail: string | null | undefined;
  messages: AntiLoopMessage[]; // chronological order
  autoReplyCount?: number | null;
}

export interface AntiLoopResult {
  blocked: boolean;
  reason?: string;
  code?: 'own_store_sender' | 'automated_sender' | 'auto_submitted_header' | 'echo' | 'no_progress';
  needsHuman?: boolean;
}

const AUTOMATED_LOCAL_PREFIXES = [
  'no-reply',
  'noreply',
  'mailer-daemon',
  'postmaster',
  'bounce',
  'notifications',
];

function extractEmail(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : raw).trim().toLowerCase();
  const m2 = candidate.match(/[^\s<>,;]+@[^\s<>,;]+/);
  return (m2 ? m2[0] : candidate).trim();
}


function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase();
}

function localOf(email: string): string {
  const at = email.lastIndexOf('@');
  return (at === -1 ? email : email.slice(0, at)).trim().toLowerCase();
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (Array.isArray(headers)) {
    for (const h of headers as AntiLoopHeader[]) {
      if (h?.name) out[String(h.name).toLowerCase()] = String(h.value ?? '').trim();
    }
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      out[k.toLowerCase()] = String(v ?? '').trim();
    }
  }
  return out;
}

export function normalizeBody(text: string): string {
  if (!text) return '';
  let t = text.toLowerCase();
  // remove quoted lines
  t = t
    .split('\n')
    .filter((l) => !l.trim().startsWith('>'))
    .join('\n');
  // strip accents
  t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // strip urls and emails (signatures, tracking)
  t = t.replace(/https?:\/\/\S+/g, ' ').replace(/\S+@\S+\.\S+/g, ' ');
  // strip greetings / closings
  t = t.replace(
    /\b(hi|hello|hey|ola|oi|bonjour|hola|ciao|hallo|dear|prezado|prezada)\b[^\n]{0,40}/g,
    ' ',
  );
  t = t.replace(
    /\b(kind regards|best regards|regards|atenciosamente|abracos|abraco|cordialement|saludos|cordiali saluti|mit freundlichen grussen|sincerely|obrigado|obrigada|thanks|thank you)\b[\s\S]*$/,
    ' ',
  );
  // punctuation + whitespace
  t = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [, c] of A) total += c;
  for (const [, c] of B) total += c;
  for (const [g, c] of A) {
    const o = B.get(g);
    if (o) inter += Math.min(c, o);
  }
  return total === 0 ? 0 : (2 * inter) / total;
}

function hasNewInformation(inbound: string, previousInbound: string[]): boolean {
  const text = inbound || '';
  // order number / tracking code / new email address counts as progress
  if (/#?\d{4,}/.test(text)) return true;
  if (/\b[A-Z0-9]{8,}\b/.test(text)) return true;
  const emails = text.match(/\S+@\S+\.\S+/g) || [];
  const prev = previousInbound.join(' ').toLowerCase();
  if (emails.some((e) => !prev.includes(e.toLowerCase()))) return true;
  return false;
}

export function checkAntiLoop(input: AntiLoopInput): AntiLoopResult {
  const sender = (input.inboundSenderEmail || '').trim().toLowerCase();
  const storeSender = (input.storeSenderEmail || '').trim().toLowerCase();

  // 1. Own store / automated sender
  if (sender) {
    if (storeSender && sender === storeSender) {
      return { blocked: true, code: 'own_store_sender', reason: `Remetente é o próprio e-mail da loja (${sender})` };
    }
    const storeDomain = domainOf(storeSender);
    if (storeDomain && domainOf(sender) === storeDomain) {
      return { blocked: true, code: 'own_store_sender', reason: `Remetente usa o mesmo domínio da loja (${storeDomain})` };
    }
    const local = localOf(sender);
    const matched = AUTOMATED_LOCAL_PREFIXES.find((p) => local.startsWith(p));
    if (matched) {
      return { blocked: true, code: 'automated_sender', reason: `Remetente automático detectado (${matched}@...)` };
    }
  }

  // 2. Automated headers
  const h = normalizeHeaders(input.headers);
  const autoSubmitted = (h['auto-submitted'] || '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') {
    return { blocked: true, code: 'auto_submitted_header', reason: `Header Auto-Submitted: ${autoSubmitted}` };
  }
  const precedence = (h['precedence'] || '').toLowerCase();
  if (['bulk', 'auto_reply', 'junk', 'list'].includes(precedence)) {
    return { blocked: true, code: 'auto_submitted_header', reason: `Header Precedence: ${precedence}` };
  }
  for (const key of ['x-autoreply', 'x-autorespond', 'x-auto-response-suppress']) {
    if (key in h) {
      return { blocked: true, code: 'auto_submitted_header', reason: `Header ${key} presente` };
    }
  }

  // 3. Echo of Sophia's last outbound message
  const lastOutbound = [...input.messages].reverse().find((m) => m.direction === 'outbound');
  const inboundNorm = normalizeBody(input.inboundContent || '');
  if (lastOutbound && inboundNorm.length > 20) {
    const outNorm = normalizeBody(lastOutbound.content || '');
    if (outNorm.length > 20) {
      if (inboundNorm.includes(outNorm)) {
        return { blocked: true, code: 'echo', reason: 'Mensagem recebida contém integralmente a última resposta enviada (echo)' };
      }
      const sim = similarity(inboundNorm, outNorm);
      if (sim >= 0.9) {
        return { blocked: true, code: 'echo', reason: `Echo detectado (similaridade ${(sim * 100).toFixed(0)}%)` };
      }
    }
  }

  // 4. No progress limit
  const count = input.autoReplyCount || 0;
  if (count >= 3) {
    const previousInbound = input.messages
      .filter((m) => m.direction === 'inbound')
      .map((m) => m.content || '');
    if (!hasNewInformation(input.inboundContent || '', previousInbound.slice(0, -1))) {
      return {
        blocked: true,
        code: 'no_progress',
        needsHuman: true,
        reason: `${count} respostas automáticas sem nova informação do cliente — enviado para revisão humana`,
      };
    }
  }

  return { blocked: false };
}

export function inboundHasProgress(inbound: string, previousInbound: string[]): boolean {
  return hasNewInformation(inbound, previousInbound);
}
