---
impacto: nada_mudou
secao: alterado
titulo: Quando o servidor não responde, o aviso na tela diz o motivo e o código para localizar
---

Antes, uma chamada que não obtinha resposta (prazo de 10 s esgotado, rede caída, conexão
recusada) aparecia só como "Erro inesperado. Tente novamente.", sem causa e sem
identificador. Agora o aviso diz se foi falta de resposta a tempo, falta de internet ou
falha de conexão, e mostra o método, o caminho (sem o que foi digitado em buscas), o tempo
gasto e o `ID` da requisição. O servidor não registra uma chamada que não chegou a ele, então
esse `ID` e o caminho são a única pista para investigar.
