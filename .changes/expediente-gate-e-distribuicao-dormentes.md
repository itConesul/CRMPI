---
impacto: nada_mudou
secao: alterado
titulo: Base do expediente da empresa: o servidor já sabe barrar ações fora do horário, mas ainda não há onde configurá-lo
---

Primeira parte do expediente da empresa (#67). O servidor passa a saber recusar ações de
atendente fora do horário (`403 OUT_OF_WORK_HOURS`) e a não incluí-lo na distribuição de
conversas, e a IA deixa de prometer um atendente quando ninguém pode assumir. A leitura das
conversas continua liberada.

Nenhuma instalação muda de comportamento: o expediente só existe quando alguém o configura, e
a tela e a rota para configurá-lo chegam numa próxima entrega. Sem expediente configurado — ou
com uma configuração inválida — ninguém é barrado.
