---
impacto: nada_mudou
secao: alterado
titulo: O código mostrado no aviso de falha agora serve para localizar a chamada em qualquer tela
---

Antes só a listagem de conversas reaproveitava o código que o navegador envia; as demais
rotas geravam um código próprio, e o `ID` do aviso "o servidor não respondeu a tempo" não
aparecia em nenhum registro. Agora todas as rotas da API usam o código do navegador (só se
for um UUID válido), e ele serve para localizar a chamada em qualquer tela.
