# Resposta 100% no idioma do cliente (sem mistura)

## Situação atual (verificada no código)

- `generate-ai-reply`: a chamada de detecção pede JSON com `"language": "English"` fixo no exemplo e o código só lê `parsed.sentiment` — o campo `language` é descartado. Não existe nenhuma instrução de idioma no prompt enviado. O prompt manda "SEMPRE abra com 'Hi [PrimeiroNome],'", "Sempre assine: Kind regards,\nSophia" e várias frases-modelo em inglês.
- `auto-reply-scheduler`: já detecta e usa o idioma (`languageInstruction`), mas o prompt tem "Default language: English", a assinatura fixa `"Kind regards,\nSophia — {loja} Support"` e respostas de spam/parceria fixas em inglês.

Resultado: o modelo mistura saudação/despedida em inglês com corpo no idioma do cliente.

## Correções

### generate-ai-reply
1. Corrigir o prompt da detecção para retornar o idioma real da mensagem (ex.: `"language": "the exact language of the message, e.g: English, Portuguese, Spanish, French"`), extrair `parsed.language` e guardar em `detectedLanguage`.
2. Inserir a REGRA DE IDIOMA obrigatória no topo do system prompt (acima de tudo), com o idioma detectado interpolado, incluindo a instrução de revisar antes de finalizar.
3. Também repetir a instrução de idioma no `userMessage`, junto do bloco de tom.
4. Ajustar as regras de tom/formato: saudação e despedida no idioma do cliente; manter nome/sufixo `Sophia — {loja} Support`, mas a linha de fecho traduzida (PT "Atenciosamente", ES "Un saludo", FR "Cordialement"). Remover "Sempre assine: Kind regards" e o "Hi [PrimeiroNome]" fixo (passa a ser "saudação equivalente no idioma do cliente + primeiro nome").
5. Marcar as respostas fixas em inglês (spam e notificações de sistema) como modelos a serem escritos no idioma detectado, mantendo o mesmo conteúdo.

### auto-reply-scheduler
1. Substituir o bloco "LANGUAGE RULES" por a REGRA DE IDIOMA obrigatória com `${detectedLanguage}`, removendo "Default language: English".
2. Trocar "Sign every message: Kind regards,\nSophia — {loja} Support" por assinatura com a linha de fecho no idioma do cliente + "Sophia — {loja} Support".
3. As respostas fixas de spam/parceria no prompt passam a indicar "no idioma do cliente" (o texto de spam já enviado diretamente pelo código, fora da IA, permanece como está, salvo indicação contrária).
4. Reforçar a instrução de idioma que já existe no `userMessage` com a versão completa (proibição de mistura + revisão final).

### Ordem de montagem
Como o system prompt é montado antes da detecção em `generate-ai-reply`, a construção do prompt passa a ocorrer depois da detecção de idioma (ou o bloco de idioma é prefixado ao prompt final), para permitir a interpolação.

## Não muda

- Tom, formato, estilo Sophia, sem markdown.
- Rotas Anthropic e parâmetros das chamadas (`max_tokens` / `max_completion_tokens` / `reasoning_effort`).
- Nenhuma alteração de UI ou banco.

## Deploy

Redeploy de `generate-ai-reply` e `auto-reply-scheduler`.
