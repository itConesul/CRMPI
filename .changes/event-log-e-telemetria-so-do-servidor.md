---
impacto: nada_mudou
secao: corrigido
titulo: O registro de eventos e duas telemetrias deixam de ser acessíveis pelo navegador
---

O registro de eventos do sistema guarda um trecho de cada mensagem trocada com os
clientes, e estava acessível a qualquer pessoa logada, pelo navegador. Duas
telemetrias internas do agente estavam na mesma situação. Agora só o servidor chega
nelas.

As telas Evolução da IA, Uso da IA e Métricas do operador, e a reexecução de um
webhook de automação, continuam funcionando igual: elas passaram a ler essas
tabelas pelo servidor. A atualização aplica a mudança sozinha e não exige nenhuma
ação.

Durante a atualização há um intervalo curto, entre aplicar a mudança no banco e
trocar a imagem do app, em que o app antigo ainda tenta ler essas tabelas pelo
navegador. Nesse intervalo as telas Evolução e Uso da IA mostram os números de
transferência para humano zerados, as Métricas do operador e a reexecução de
webhook respondem com erro, e tudo volta ao normal quando a imagem troca.
