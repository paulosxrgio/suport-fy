// Shared helper: strips quoted history / signatures from email replies.
// Handles both ">" quoting and Gmail-style attribution lines without ">".
export function stripQuotedText(text: string): string {
  if (!text) return '';

  const lines = text.split('\n');
  const cleanLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Gmail / Outlook attribution lines (with or without leading date pattern)
    if (/^Em\s.+escreveu\s*:/i.test(trimmed)) break;
    if (/^On\s.+wrote\s*:/i.test(trimmed)) break;
    if (/^Le\s.+a\s+écrit\s*:/i.test(trimmed)) break;
    if (/^El\s.+escribi[oó]\s*:/i.test(trimmed)) break;
    if (/^Am\s.+schrieb/i.test(trimmed)) break;
    if (/^Il\s.+ha scritto\s*:/i.test(trimmed)) break;
    // Date-first variants: "El mié, 5 ago 2026, 18:02, Sophia <x@y> escribió:"
    if (/(escribi[oó]|escreveu|wrote|a écrit|schrieb|ha scritto)\s*:\s*$/i.test(trimmed) && trimmed.length > 20) break;
    if (/<[^>]+@[^>]+>\s*(wrote|escreveu|a écrit|escribió|schrieb|ha scritto)\s*:/i.test(trimmed)) break;
    if (/^-{3,}\s*Original Message\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{3,}\s*Mensagem Original\s*-{3,}$/i.test(trimmed)) break;
    if (/^-{5,}$/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^From:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^De:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Sent:\s/i.test(trimmed)) break;
    if (/^Enviado:\s/i.test(trimmed)) break;
    if (/^To:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Para:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Subject:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^Assunto:\s/i.test(trimmed) && cleanLines.length > 0) break;
    if (/^--\s*$/.test(trimmed)) break;
    if (/^—\s*$/.test(trimmed)) break;
    if (/^_{3,}$/.test(trimmed) && cleanLines.length > 0) break;
    if (trimmed.startsWith('>') && cleanLines.length > 0) continue;

    cleanLines.push(line);
  }

  let result = cleanLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  return result.trim();
}
