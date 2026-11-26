---
impacto: exige_acao
secao: alterado
titulo: O histórico das conversas deixa de poder ser apagado, e só gerente ou administrador exclui contato
---

O histórico das conversas passa a ser protegido. Até aqui, um atendente conseguia
apagar uma conversa inteira (e, com ela, as mensagens, as notas internas e os
casos do assistente), e quem só visualiza conseguia editar e apagar mensagens.
Agora ninguém apaga conversa pela API, e só um atendente ou alguém de nível
superior edita ou apaga mensagem de uma conversa que enxerga.

Excluir um contato também mudou. O botão "Excluir contato" só aparece para
gerente e administrador, e o servidor recusa o pedido de quem não tem esse nível.
Um contato que já tem conversa ou compromisso não é mais excluído: a tela avisa
que ele tem histórico e orienta a pedir a um administrador que o anonimize, o que
preserva o registro. Contato sem nenhum histórico continua podendo ser excluído.

A atualização aplica a mudança de banco sozinha.

## Requer atenção

- **Atendentes e quem só visualiza perdem o botão "Excluir contato".** Se a sua
  equipe depende disso, a exclusão passa a ser feita por um gerente ou administrador.
- **Contato com conversa ou compromisso não pode mais ser excluído.** O caminho é
  anonimizar, na ficha do contato, aba LGPD (só administrador vê essa aba). A exclusão
  continua valendo só para contato sem histórico.
- **Scripts próprios que apagam conversas ou editam mensagens direto no banco param de funcionar.**
  Os scripts do produto não fazem isso; confira os seus antes de atualizar.
- **Durante a atualização, por alguns instantes, excluir contato pode dar erro.**
  O banco é atualizado antes de o aplicativo reiniciar; passa assim que o aplicativo novo sobe.
