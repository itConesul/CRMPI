---
impacto: capacidade_nova
secao: adicionado
titulo: Expediente da empresa: fora do horário o atendente só consulta, e o servidor recusa as ações
---

Primeira parte do expediente da empresa (#67). O administrador define o horário em que a equipe
atende, e fora dele o atendente continua **vendo** as conversas e o histórico, mas não age:
assumir, responder, anotar, transferir, adiar e fechar são recusados pelo servidor (`403
OUT_OF_WORK_HOURS`), e a tela mostra uma faixa com o horário da empresa e quando ele abre, trava o
campo de resposta e os botões de ação, e abre uma página explicando. `admin` e `manager` nunca são
barrados. A distribuição de conversas e a promessa da IA ("um atendente vai assumir") também passam a
respeitar o horário.

Por enquanto o horário é definido pela API (`PATCH /api/v1/settings/expediente`, só `admin`); a tela
de configuração chega numa próxima entrega. O expediente aceita janela que vira o dia (22:00–06:00).

Nenhuma instalação muda de comportamento até alguém definir um expediente. Sem expediente — ou com
um valor inválido — ninguém é barrado.
