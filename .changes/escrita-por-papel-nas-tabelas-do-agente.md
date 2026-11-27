---
impacto: nada_mudou
secao: corrigido
titulo: As tabelas internas do agente deixam de aceitar escrita direta pela API
---

Quem entrava no sistema com um usuário comum, inclusive quem só visualiza,
conseguia escrever direto pela API de dados em tabelas internas do agente: a fila
de trabalhos, os agendamentos, os registros de envio e as proteções. Agora o banco
recusa. Continuam funcionando, para atendente ou nível superior, as quatro ações
que o aplicativo faz em nome de quem está logado: decidir a próxima ação sugerida,
devolver a conversa ao automático, aceitar uma reativação e gerar o aviso de
sugestão com mais de um negócio. Esse aviso agora só nasce quando um atendente ou
nível superior abre o funil.

Nenhuma tela mudou e a atualização aplica o ajuste de banco sozinha. Se você tem
uma integração própria que escreve nessas tabelas pela API de dados com login de
usuário, ela passa a ser recusada. Acesso direto ao banco e chave de serviço não
são afetados.
