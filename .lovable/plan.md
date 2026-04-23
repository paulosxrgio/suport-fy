

## Plano: Sistema Sophia Multi-Idioma + Agente Cérebro Supervisor

Implementar nas 3 lojas (The G Club, Holy Ember, The W Exchange) o sistema completo de suporte inteligente com Sophia multi-idioma, supervisor automático "Cérebro" e auto-fechamento de spam.

### 1. Atualizar System Prompt da Sophia (multi-idioma)

Substituir o system prompt atual no `auto-reply-scheduler/index.ts` pelo novo prompt em inglês com:
- **Auto-detecção de idioma** (English, Portuguese, Spanish, French, Korean, Italian, German) — responder no mesmo idioma do cliente
- **Golden Rule**: resolver na mesma mensagem, nunca pedir info que já tem
- **Spam zero-tolerance**: lista de gatilhos + resposta única + fechar ticket
- **Order issues**: sempre buscar pedido antes de responder
- **Fraud accusation**: mostrar dados reais, nunca defender no vazio
- **Delivery delays**: 8–15 dias úteis, link de tracking imediato
- **Refund**: empático na primeira menção, aceitar sem resistência na segunda
- **Anti-hallucination**: lista de proibições explícitas
- **Forbidden phrases**: lista de clichês banidos
- **Assinatura**: "Sophia — [STORE_NAME] Support" (interpolar `storeName` dinamicamente)

### 2. Auto-fechamento de SPAM no `auto-reply-scheduler`

Adicionar verificação **ANTES** da chamada de IA (logo após montar `consolidatedInput`):

```text
- Lista de 15 indicators (speak with owner, shopify expert, etc.)
- Se detectar spam:
  → Enviar reply única via Resend com mensagem fixa
  → UPDATE tickets SET status='closed'
  → Inserir mensagem outbound no histórico
  → Log "[SPAM AUTO-CLOSED]"
  → continue (pular IA)
```

### 3. Nova Edge Function `supervisor-agent` (Cérebro)

Criar `supabase/functions/supervisor-agent/index.ts`:
- Carrega últimas 24h de mensagens outbound de cada loja
- Carrega **últimos 7 relatórios** (`brain_reports`) para evitar regras repetidas
- Chama IA (OpenAI/Anthropic conforme `ai_provider`) com `CEREBRO_PROMPT` em inglês
- Retorna JSON: `score`, `critical_errors`, `patterns_found`, `prompt_additions`, `summary`
- Salva em `brain_reports`
- Se `score < 7` OU `critical_errors.length > 0`: envia email via Resend para `sender_email` da loja
- Aceita body opcional `{ store_id, force: true }` para análise manual

Adicionar no `supabase/config.toml`:
```toml
[functions.supervisor-agent]
verify_jwt = false
```

### 4. Migration — Tabela `brain_reports` + cron diário 23h

```sql
create table brain_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  score integer,
  critical_errors jsonb default '[]',
  patterns_found jsonb default '[]',
  prompt_additions jsonb default '[]',
  summary text,
  conversations_analyzed integer,
  created_at timestamptz default now()
);
-- RLS: usuários veem apenas reports de suas lojas
-- Cron pg_cron: '0 23 * * *' invoca supervisor-agent
```

### 5. Card "Agente Cérebro" no `AIAgentPage.tsx`

Adicionar abaixo das seções existentes (Qualidade + Sugestões):
- Card **read-only** mostrando último relatório:
  - Score colorido (verde ≥8, amarelo 5-7, vermelho <5)
  - Resumo (`summary`)
  - Erros críticos (lista vermelha)
  - Padrões encontrados (lista cinza)
  - Regras adicionadas (lista verde)
  - Total de conversas analisadas + data
- Botão **"Force analysis now"** → `supabase.functions.invoke('supervisor-agent', { body: { store_id, force: true } })` com loading

### Detalhes técnicos

- O Cérebro usa o mesmo provider de IA configurado em `settings.ai_provider`
- O Cérebro **só sugere regras**, não altera prompts automaticamente — tudo fica visível como histórico
- `prompt_additions` do Cérebro é informativo (admin pode aplicar manualmente via página de Configurações)
- Email de alerta usa `resend_api_key` da loja, `from = sender_email`, `to = sender_email`
- Spam detector roda antes da IA → economia de tokens + resposta instantânea
- Sophia continua usando `stripMarkdownLinks` e `productNameReminder` já existentes

### Arquivos modificados

- `supabase/functions/auto-reply-scheduler/index.ts` — novo system prompt + spam detector + auto-close
- `supabase/functions/supervisor-agent/index.ts` — **novo**
- `supabase/config.toml` — registrar nova função
- Nova migration: tabela `brain_reports` + RLS + cron job 23h
- `src/components/helpdesk/AIAgentPage.tsx` — card do Cérebro + botão force analysis
- `src/integrations/supabase/types.ts` — auto-regenerado após migration

