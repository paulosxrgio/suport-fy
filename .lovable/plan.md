
# Análise Completa do Sistema Multi-Lojas

## Resumo Executivo

Após análise detalhada de todo o sistema, identifiquei **3 problemas críticos** que precisam ser corrigidos e **2 melhorias recomendadas**.

---

## Problemas Críticos Encontrados

### 1. AIAgentPage.tsx - NÃO ESTÁ ISOLADA POR LOJA (CRÍTICO)

**Arquivo:** `src/components/helpdesk/AIAgentPage.tsx`

**Problema:** A página de configuração do Agente de IA ainda está buscando e salvando configurações de forma **global**, não por loja. As queries usam `.limit(1).maybeSingle()` sem filtrar por `store_id`.

**Código problemático (linhas 38-48):**
```typescript
const { data: settings } = useQuery({
  queryKey: ['ai-settings'],
  queryFn: async () => {
    const { data } = await supabase
      .from('settings')
      .select('...')
      .limit(1)           // ❌ Pega a primeira linha
      .maybeSingle();     // ❌ Sem filtro de store_id
    return data;
  },
});
```

**Código problemático no save (linhas 63-90):**
```typescript
const saveMutation = useMutation({
  mutationFn: async () => {
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .limit(1)           // ❌ Pega qualquer linha
      .maybeSingle();
    // ...
  },
});
```

**Impacto:** Ao salvar a OpenAI API Key na Loja 02, ela está sendo salva na primeira linha (Loja 01).

---

### 2. translate-text Edge Function - NÃO ESTÁ ISOLADA POR LOJA (CRÍTICO)

**Arquivo:** `supabase/functions/translate-text/index.ts`

**Problema:** A função busca a OpenAI API Key usando `.single()` sem filtrar por `store_id`.

**Código problemático (linhas 30-34):**
```typescript
const { data: settings } = await supabase
  .from("settings")
  .select("openai_api_key")
  .single();    // ❌ Sem filtro - pega qualquer linha
```

**Impacto:** A tradução sempre usa a chave da primeira loja encontrada.

---

### 3. Duplicação de Dados entre `stores` e `settings`

**Observação do banco de dados:**

| Campo | Tabela `stores` | Tabela `settings` |
|-------|-----------------|-------------------|
| `sender_name` | Sophia - Ivory Saint | Sophia - Ivory Saint |
| `sender_email` | contact@ivorysaint.co | contact@ivorysaint.co |
| `resend_api_key` | SIM | SIM |
| `openai_api_key` | SIM | SIM |

A tabela `stores` também contém colunas de configuração (`resend_api_key`, `openai_api_key`, etc.) que estão duplicadas na tabela `settings`. Isso pode causar:
- Confusão sobre qual fonte de dados usar
- Inconsistências se um lado for atualizado e outro não
- O `generate-ai-reply` ainda tenta buscar de `stores` primeiro

---

## Componentes Funcionando Corretamente

### SettingsPage.tsx - OK
- Filtra por `currentStore.id`
- Salva com `store_id` correto
- Exibe mensagem quando nenhuma loja está selecionada

### useTickets.ts - OK
- Filtra por `currentStore.id`
- Usa `enabled: !!currentStore`

### send-email-reply Edge Function - OK
- Busca configurações da tabela `settings` filtrando por `ticket.store_id`

### process-inbound-email Edge Function - OK
- Identifica a loja pelo domínio do destinatário
- Busca Resend API Key primeiro em `stores`, depois em `settings`

### useCreateTicket - OK
- Associa `store_id: currentStore?.id` ao criar tickets

### StoreSwitcher.tsx - OK
- Permite alternar entre lojas corretamente

---

## Plano de Correção

### Correção 1: AIAgentPage.tsx

**Mudanças necessárias:**

1. Importar o `useStore` hook
2. Adicionar `currentStore` ao contexto
3. Modificar a query para filtrar por `store_id`
4. Modificar o save para fazer upsert por `store_id`
5. Adicionar UI de fallback quando não há loja selecionada
6. Invalidar cache quando trocar de loja

```typescript
// Adicionar import
import { useStore } from '@/contexts/StoreContext';

// No componente
const { currentStore } = useStore();

// Na query
const { data: settings } = useQuery({
  queryKey: ['ai-settings', currentStore?.id],  // Incluir store_id na key
  queryFn: async () => {
    const { data } = await supabase
      .from('settings')
      .select('...')
      .eq('store_id', currentStore!.id)  // Filtrar por loja
      .maybeSingle();
    return data;
  },
  enabled: !!currentStore,  // Só executa com loja selecionada
});

// No save
const settingsData = {
  store_id: currentStore!.id,  // Vincular à loja
  // ... outros campos
};
```

---

### Correção 2: translate-text Edge Function

**Mudanças necessárias:**

1. Receber `ticketId` ou `storeId` no body da request
2. Buscar o `store_id` do ticket (se passar ticketId)
3. Filtrar settings por `store_id`

```typescript
const { text, targetLanguage = "pt-br", ticketId, storeId } = await req.json();

// Determinar o store_id
let targetStoreId = storeId;
if (!targetStoreId && ticketId) {
  const { data: ticket } = await supabase
    .from("tickets")
    .select("store_id")
    .eq("id", ticketId)
    .single();
  targetStoreId = ticket?.store_id;
}

// Buscar settings por store_id
const { data: settings } = await supabase
  .from("settings")
  .select("openai_api_key")
  .eq("store_id", targetStoreId)
  .maybeSingle();
```

---

### Melhoria Recomendada: Limpeza da Tabela `stores`

**Ação sugerida (não urgente):**

Remover as colunas duplicadas da tabela `stores`:
- `sender_name`
- `sender_email`
- `email_signature`
- `resend_api_key`
- `openai_api_key`
- `ai_system_prompt`
- `ai_model`
- `ai_is_active`
- `ai_response_delay`

Manter apenas:
- `id`, `user_id`, `name`, `domain`, `created_at`, `updated_at`

**Impacto:** Simplificar a lógica e evitar duplicação de dados.

---

## Resumo das Alterações

| Arquivo | Ação | Prioridade |
|---------|------|------------|
| `src/components/helpdesk/AIAgentPage.tsx` | Adicionar filtro por `currentStore.id` | CRÍTICA |
| `supabase/functions/translate-text/index.ts` | Receber `storeId` e filtrar | CRÍTICA |
| `src/hooks/useTranslation.ts` | Passar `storeId` na chamada | CRÍTICA |
| `supabase/functions/generate-ai-reply/index.ts` | Remover busca na tabela `stores` | Média |
| Migração de banco | Remover colunas duplicadas de `stores` | Baixa |

---

## Arquivos a Serem Modificados

1. **`src/components/helpdesk/AIAgentPage.tsx`** - Adicionar isolamento por loja
2. **`supabase/functions/translate-text/index.ts`** - Receber e usar storeId
3. **`src/hooks/useTranslation.ts`** - Passar storeId para a edge function
4. **`src/components/helpdesk/ConversationView.tsx`** - Passar storeId para tradução
5. **`supabase/functions/generate-ai-reply/index.ts`** - Simplificar (buscar apenas de settings)

