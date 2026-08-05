# Correção do auto-atendimento: fila parada + resposta contradizendo a Shopify

## Diagnóstico (confirmado)

A causa da parada NÃO foi o cron nem a correção de segurança de ontem.

- O agendamento continua rodando: há invocações da função `auto-reply-scheduler` a cada ~60 segundos.
- Todas essas invocações falham no boot com:
  `worker boot error: Uncaught SyntaxError: Identifier 'lastInboundMsg' has already been declared (index.ts:759)`
- No código, `const lastInboundMsg` é declarado duas vezes no mesmo escopo: uma na guarda anti-loop (linha 200) e outra no bloco de análise/supervisor (linha 877). A função nunca chega a executar.
- Reflexo na fila `auto_reply_queue`: 2 itens presos em `pending` (o mais recente de hoje, 21:19), 1 item preso em `processing` desde março, 100 `failed` sem registro de motivo.

Ou seja: fila enchendo, cron chamando, função morrendo no boot. Corrigindo a declaração duplicada, o processamento volta sozinho — os itens `pending` são retomados.

## Problema 1 — Voltar a responder e ganhar visibilidade

### 1a. Corrigir o boot
Renomear a segunda declaração (`lastInboundMsg` do bloco de análise) para um nome próprio, sem tocar na guarda anti-loop. Depois do deploy, confirmar nos logs que a função inicia e que os 2 itens `pending` são processados.

### 1b. Robustez da fila
Migração adicionando à `auto_reply_queue`:
- `error_reason` (texto) — motivo do erro nos itens `failed`.
- `processing_started_at` (timestamp) — marcado ao mudar para `processing`.

No início de cada execução, o scheduler devolve para `pending` todo item em `processing` há mais de 10 minutos. Em qualquer falha, grava `status = 'failed'` junto com `error_reason`.

### 1c. Visibilidade na UI
Migração adicionando `tickets.anti_loop_reason` (texto). Quando `checkAntiLoop` bloquear, o scheduler grava o motivo no ticket (além do `status = 'loop_ignorado'` na fila) e também grava o motivo quando marca `needs_human = true`.

Na interface, na lista de tickets e no topo da conversa, um badge discreto (âmbar) aparece quando o ticket tem `needs_human` ou `anti_loop_reason`, exibindo o motivo — por exemplo "Aguardando atendimento humano: 3 respostas automáticas sem nova informação". Nenhuma outra mudança visual.

### 1d. Ajustes no `_shared/anti-loop.ts`
- Remover `contact` e `support` de `AUTOMATED_LOCAL_PREFIXES` (o loop da própria loja continua coberto por `own_store_sender`). Ficam: `no-reply`, `noreply`, `mailer-daemon`, `postmaster`, `bounce`, `notifications`.
- Echo: passar a comparar textos já limpos de citação. A função `stripQuotedText` (que hoje vive duplicada nas duas funções) vai para `_shared/`, ganha os padrões de citação sem ">" do tipo `El mié, 5 ago 2026, ... escribió:` / `Em ... escreveu:` / `On ... wrote:`, e é aplicada tanto ao conteúdo recebido quanto ao último outbound antes do cálculo de similaridade.
- Remetente: usar o `Reply-To` quando presente, senão o `From` original dos headers salvos, e só então o `sender_email` do registro — nunca o endereço de quem encaminhou.

## Problema 2 — IA contradizendo o estado do pedido

### 2a. Bloco de decisão por estado
Inserir nas DUAS funções, imediatamente antes da seção de reembolso/cancelamento, um bloco "LÓGICA POR ESTADO DO PEDIDO (PRIORIDADE MÁXIMA)":

- **Pago + não enviado (UNFULFILLED) + pedido de cancelamento/reembolso:** o cancelamento é possível nesta fase. Confirmar que a solicitação foi registrada e que o time vai processar cancelamento e reembolso. Proibido dizer que não pode reembolsar "porque ainda não foi enviado" e proibido sugerir esperar a entrega para devolver. O ticket recebe `needs_human = true` para o time executar o cancelamento na Shopify.
- **Enviado (FULFILLED / em trânsito):** cancelamento antes da entrega não é mais possível; oferecer devolução conforme a política e informar o rastreio.
- A regra de retenção ("ofereça alternativa antes de aceitar reembolso") não se aplica a cancelamento de pedido não enviado.
- Proibido afirmar qualquer coisa que contradiga o bloco "DADOS DOS PEDIDOS DO CLIENTE NA SHOPIFY". Dado ausente = não inventar; dizer o que pode fazer e marcar para revisão humana.

No scheduler, quando a mensagem do cliente pedir cancelamento e houver pedido pago e não enviado, marcar `needs_human = true` no ticket.

### 2b. Igualar o contexto Shopify
O `shopifyContext` do `auto-reply-scheduler` passa a montar o mesmo texto do `generate-ai-reply`, com campo "Situação" legível e link de rastreio:
- `UNFULFILLED` → "pago, ainda não enviado — cancelamento possível"
- `FULFILLED` → "enviado — devolução conforme política" + link `https://t.17track.net/<tracking>` quando houver código
Ambas as funções passam a usar o mesmo texto de situação (nas duas, em português legível).

## Notas técnicas
- Sem mudanças em `max_completion_tokens`, `reasoning_effort` ou nas rotas Anthropic.
- Regra de idioma (resposta 100% no idioma do cliente) mantida intacta.
- Arquivos tocados: `supabase/functions/auto-reply-scheduler/index.ts`, `supabase/functions/generate-ai-reply/index.ts`, `supabase/functions/process-inbound-email/index.ts` (usar o `stripQuotedText` compartilhado), `supabase/functions/_shared/anti-loop.ts`, novo `_shared/strip-quoted.ts`, `src/types/helpdesk.ts`, `src/components/helpdesk/TicketList.tsx`, `src/components/helpdesk/ConversationView.tsx`.
- Duas migrações: colunas da fila (`error_reason`, `processing_started_at`) e `tickets.anti_loop_reason`.
