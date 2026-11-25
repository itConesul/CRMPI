---
impacto: nada_mudou
secao: adicionado
titulo: A API do expediente informa quantas tentativas foram barradas hoje
---

A consulta do expediente (`GET /api/v1/settings/expediente`) passa a devolver
`barrados_hoje`: quantas ações de atendentes o expediente barrou hoje. Só
administrador e gerente recebem o número; os demais recebem `null`. Se o Redis
não responder, o número vem `null` e o resto da resposta segue normal; a
consulta ao Redis tem prazo de 1,5 s, então um Redis travado não segura a tela.

Por enquanto nenhuma tela mostra esse número (isso vem com a tela de
configuração do expediente), então você não vê diferença ao atualizar e não
precisa fazer nada.
