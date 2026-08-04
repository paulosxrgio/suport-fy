# Adicionar GPT-5 Mini como opção de modelo

Adiciona "GPT-5 Mini" (`gpt-5-mini`) à lista de modelos OpenAI, sem remover nenhum modelo existente. O gpt-4o continua como padrão. As chamadas OpenAI com modelo dinâmico passam a montar o corpo da requisição de forma condicional.

## Mudança 1 — Front

`src/components/helpdesk/SettingsPage.tsx` (linha ~486): adicionar um item ao Select de modelos OpenAI, mantendo GPT-4o, GPT-4o Mini e GPT-3.5 Turbo:

```tsx
<SelectItem value="gpt-5-mini">GPT-5 Mini</SelectItem>
```

## Mudança 2 — Backend (3 chamadas com modelo dinâmico)

Em cada uma, definir `const isGpt5 = String(model).startsWith('gpt-5');` e espalhar os parâmetros condicionalmente no body, mantendo os mesmos `messages` de hoje.

| Função | Local | gpt-5 | demais (igual a hoje) |
|---|---|---|---|
| `generate-ai-reply` | resposta principal (~linha 668) | `max_completion_tokens: 900`, `reasoning_effort: 'minimal'` | `max_tokens: 500`, `temperature: 0.7` |
| `auto-reply-scheduler` | resposta principal (~linha 813) | `max_completion_tokens: 900`, `reasoning_effort: 'minimal'` | `max_tokens: 500`, `temperature: 0.7` |
| `verify-ai-connection` | teste OpenAI (~linha 31) | `max_completion_tokens: 16`, `reasoning_effort: 'minimal'` | `max_tokens: 1` |

Em `verify-ai-connection` o modelo testado é `model || 'gpt-4o-mini'`, então o `isGpt5` é calculado sobre esse valor resolvido.

## Não muda

- Nenhuma chamada `api.anthropic.com` (Claude segue com `max_tokens`).
- Nenhuma chamada fixa em `gpt-4o-mini`: detecção de sentimento, classificador de ação, memória do cliente, tradução e análise de qualidade permanecem idênticas.
- Prompts, lógica, nomes de variáveis e o modelo padrão (`gpt-4o`).

## Depois

Redeploy das 3 edge functions alteradas.
