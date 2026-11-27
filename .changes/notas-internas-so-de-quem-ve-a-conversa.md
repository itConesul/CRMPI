---
impacto: nada_mudou
secao: corrigido
titulo: Aviso de menção e nota interna chegam na hora, só para quem vê a conversa
---

Quando alguém era mencionado numa nota interna, o aviso dentro do sistema não
aparecia, e a nota nova só surgia na conversa depois de recarregar a página.
Agora as duas coisas chegam na hora.

Junto com isso, o banco passou a exigir que a pessoa veja a conversa para ler,
escrever ou apagar as notas dela. Antes, um atendente conseguia direto pela API
de dados ler as notas de conversas que não eram dele. Quem tem acesso somente de
visualização também deixa de ler notas por essa API; as telas já não mostravam.
Quem é mencionado numa conversa que não pode ver não recebe o aviso na tela.

Nenhuma tela mudou e a atualização aplica o ajuste de banco sozinha. Se você tem
uma integração própria que lê notas pela API de dados com um login somente de
visualização, ela passa a receber a lista vazia.
