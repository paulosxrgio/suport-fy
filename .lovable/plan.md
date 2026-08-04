# Seletor lateral deve mostrar só as lojas ativas

## O que acontece hoje

O diálogo "Gerenciar Lojas" salva a visibilidade no banco corretamente, e o contexto de lojas (que alimenta o seletor lateral) já busca apenas lojas com visibilidade ativa. O problema é de sincronização: ao desativar uma loja, o diálogo invalida um cache de consulta que o contexto não usa, então a lista lateral continua exibindo a loja desativada até recarregar a página. Além disso, se a loja desativada for a que está selecionada no momento, ela permanece ativa no painel.

## Correção

1. Após alternar a visibilidade (e após reordenar), chamar o refetch do contexto de lojas para que o seletor lateral atualize na hora.
2. No contexto de lojas, após recarregar a lista: se a loja atualmente selecionada não estiver mais na lista de visíveis, selecionar automaticamente a primeira loja visível (ou nenhuma, caso não exista).
3. Manter a ordem por ordem de exibição.

## Detalhes técnicos

- `src/components/helpdesk/AccountSettingsDialog.tsx`: consumir `useStore()` e chamar `refetchStores()` nos `onSuccess` de `toggleVisibilityMutation` e `updateOrderMutation`.
- `src/contexts/StoreContext.tsx`: em `fetchStores`, validar `currentStore` contra a lista retornada e reajustar a seleção quando ele sumir.
