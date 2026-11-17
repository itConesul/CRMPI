---
impacto: nada_mudou
secao: alterado
titulo: O código mostrado no aviso de falha agora é o mesmo que o servidor registra na lista de conversas
---

O aviso "o servidor não respondeu a tempo" mostra um `ID`. Na listagem de conversas, o
servidor gerava um código próprio e ignorava o enviado pelo navegador, então o `ID` do aviso
não aparecia em nenhum registro. Agora a rota aproveita o código do navegador (só se for um
UUID válido), e ele serve para localizar a chamada.
