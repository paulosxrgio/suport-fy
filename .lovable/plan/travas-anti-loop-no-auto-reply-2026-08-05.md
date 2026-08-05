# Travas anti-loop no auto-reply

Objetivo: impedir que a Sophia responda e-mails automáticos, e-mails da própria loja e echos das próprias respostas, cortando o loop de ~5 em 5 minutos e o gasto de tokens. Todas as checagens rodam ANTES de qualquer chamada à OpenAI/Anthropic.

## O que muda

### 1. Banco de dados
- `messages.email_headers` (jsonb, default `{}`): guarda os headers do e-mail recebido.
- `tickets.auto_reply_count` (int, default 0): quantas respostas automáticas seguidas a Sophia enviou sem novidade do cliente.
- `tickets.needs_human` (boolean, default false): marca conversa para revisão humana.
- Nada é removido; conversas existentes continuam funcionando.

### 2. Captura de headers (`process-inbound-email`)
Hoje a função já lê `webhookData.headers` só para threading. Passará a salvar o array completo de headers em `messages.email_headers` na inserção da mensagem inbound, para o scheduler poder inspecionar.

### 3. Guarda anti-loop compartilhada
Novo arquivo `supabase/functions/_shared/anti-loop.ts` com uma função que recebe (mensagem inbound, headers, settings da loja, histórico do ticket) e devolve `{ blocked, reason }`. Usada por `auto-reply-scheduler` e `generate-ai-reply`.

Checagens, na ordem:

1. **Remetente da própria loja / automático**
   - Remetente igual ao `sender_email` da loja, ou mesmo domínio do `sender_email`.
   - Parte local começando com: `no-reply`, `noreply`, `contact`, `support`, `mailer-daemon`, `postmaster`, `bounce`, `notifications`.
2. **Headers de auto-resposta**
   - `Auto-Submitted` com valor diferente de `no`.
   - `Precedence`: `bulk`, `auto_reply`, `junk` ou `list`.
   - Presença de `X-Autoreply`, `X-Autorespond` ou `X-Auto-Response-Suppress`.
3. **Echo da resposta anterior da Sophia**
   - Normaliza (minúsculas, sem acentos/pontuação extra, sem saudação/assinatura, espaços colapsados) a mensagem recebida e a última mensagem outbound do ticket.
   - Bloqueia se o texto recebido contiver integralmente o corpo enviado ou se a similaridade (Dice sobre bigramas) for >= 0,90.
4. **Limite sem progresso**
   - Se `auto_reply_count >= 3` e a mensagem do cliente não traz informação nova (sem número de pedido / sem e-mail ou código novo em relação ao histórico), bloqueia, seta `needs_human = true` e para de responder automaticamente.

### 4. `auto-reply-scheduler`
- Executa a guarda logo após buscar ticket, settings e mensagens — antes do detector de spam e antes de qualquer chamada de IA.
- Se bloqueada: `console.log('[LOOP IGNORADO] motivo…')`, marca o item da fila como `loop_ignorado`, seta `needs_human = true` quando o motivo for o limite do item 4, e segue para o próximo item. Nenhum e-mail é enviado.
- No envio bem-sucedido de uma resposta automática: incrementa `auto_reply_count`; quando a mensagem do cliente traz informação nova, zera o contador.

### 5. `generate-ai-reply`
- Mesma guarda aplicada antes da chamada ao modelo. Como é acionada manualmente pela interface (Magic Reply), retorna `200` com `{ blocked: true, reason }` em vez de gerar texto, e a interface mostra o motivo em um toast, sem quebrar o fluxo atual.

## Notas técnicas
- Prompts e parâmetros de modelo permanecem intocados.
- A guarda é puramente local (sem chamadas externas), então roda em milissegundos e não consome tokens.
- Após as edições, redeploy de `process-inbound-email`, `auto-reply-scheduler` e `generate-ai-reply`.
