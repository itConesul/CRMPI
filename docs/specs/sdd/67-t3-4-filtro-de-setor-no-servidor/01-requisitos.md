# 01 — Requisitos

## Problema
A spec da #67 (`docs/specs/sdd/67-expediente-e-setor/02-design.md` §1, F6) decidiu que o isolamento por departamento é
garantido pelo banco e que **o que roda com `service_role` "não é coberto pela RLS: filtro de setor no código, numa
função compartilhada, com teste que reprove quem não a usa (T3.4)"**. Hoje essa função **não existe**, e a regra de
visibilidade mora só no SQL (`fn_can_view_conversation`, `fn_can_view_lead`) e numa função de UI para abas
(`visibleInboxTabs`). Medido em `ddc5b2b`: **253 arquivos de produção** citam uma tabela protegida (limite superior, com
ruído), **113** a acessam por `.from("…")` do supabase-js (**57** com client admin) e **44** por SQL em `pg`.

Sem a função, ligar a RLS na T4b (a mudança de maior risco da spec) deixaria essas rotas devolvendo a conversa de
outro setor, que é exatamente o vazamento que a regra do dono existe para impedir.

## Requisitos
Cada requisito aponta para o trecho da spec da #67 que o originou.

| ID | Requisito | Origem |
|---|---|---|
| RF-1 | Existe **uma** decisão de visibilidade de conversa para código de servidor, com a mesma semântica da regra do banco (papel efetivo, dono, `visibility_mode`, setor) | T3.4: "função compartilhada de filtro de setor"; F6: "filtro de setor no código, numa função compartilhada" |
| RF-2 | A decisão é entregue em **três formas** que não podem divergir: predicado sobre uma linha, filtro de consulta PostgREST e fragmento SQL para `pg` | T3.4: "rotas com client admin, MCP, workers, push"; as três formas de acesso medidas em `02-design.md` §1 |
| RF-3 | Listagem **paginada** filtra **na consulta**, nunca depois dela | contrato de paginação (`CLAUDE.md`: cursor, `meta.total`, `has_more`): filtrar depois vaza contagem e página |
| RF-4 | O ator pode ser **usuário** (papel efetivo, setores) ou **sistema com motivo declarado**; o ator **token** (MCP) fica reservado à T3.6 | F1 (MCP com departamento no token) e T3.6; processo interno é o grupo D do inventário |
| RF-5 | **Falha fechada:** se a regra do ator não puder ser resolvida (erro de leitura, papel ausente), nada é visível | princípio de `fn_can_view_conversation` (`when fn_user_role_in_org(p_org) is null then false`) |
| RF-6 | Com o **interruptor de setor desligado** (padrão até o teste de duas equipes passar), a decisão se comporta **como o banco de hoje**: papel, dono e `visibility_mode`, sem setor | F6: "o isolamento fica desligado por padrão até o teste de duas equipes passar (T3.7 e T8)" |
| RF-7 | Um teste de **paridade** com o banco real prova que o TypeScript e o SQL concordam em toda combinação relevante, antes e depois de a T4b trocar a função | duplicar regra exige fonte da verdade declarada (anti-pattern 2 do `CLAUDE.md`) |
| RF-8 | Uma **varredura de AST** reprova código de produção que leia conversa, ou tabela do F6, com client admin ou `pg` sem passar pela função, nem constar da lista de exceções | T3.4: "varredura de AST que reprova quem lê conversa, ou tabela do F6, com client admin sem passar por ela" |
| RF-9 | A lista de exceções da varredura é **declarada, justificada por categoria, e só encolhe** | T3.4: "lista de exceções … justificada, e só encolhe" (ver Q-2: a leitura literal "nasce vazia" é impossível, medido) |
| RNF-1 | O ator é carregado **uma vez por requisição**, e em lote quando há vários destinatários (push); sem consulta por linha | (acréscimo da spec) evitar N+1; o push tem N destinatários por evento |
| RNF-2 | A regra é **pura** e roda sem banco; a leitura do ator fica em um carregador separado que **recebe o client por parâmetro**, e o módulo **não importa** client admin | padrão já usado em `lib/expediente/` (`expediente.ts` é a regra pura, `carregar.ts` é a leitura) e a decisão do dono "o banco garante e o app acompanha" |

## Critérios de aceite
A prova de cada um está em [`03-testes.md`](03-testes.md).

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | Para toda combinação (papel × `visibility_mode` × dono × setor da conversa × pertence ao setor × interruptor), a decisão TypeScript **é igual** à do banco | RF-1, RF-6, RF-7 |
| CA-2 | `agent` de outro setor **não** vê a conversa; o dono vê (Q5); `viewer` vê a conversa sem setor e a dos seus setores (Q10 e decisão C); `manager` e `admin` veem tudo | RF-1 |
| CA-3 | Os três renderizadores (predicado, PostgREST, SQL) selecionam **o mesmo conjunto** num conjunto semeado | RF-2 |
| CA-4 | Uma listagem com `limit` e cursor devolve `total` e `has_more` **só do que o ator vê** | RF-3 |
| CA-5 | Ator sem regra resolvida não vê nada; ator `sistema` sem motivo é erro de tipo e de teste | RF-4, RF-5 |
| CA-6 | Um arquivo novo que leia tabela protegida com client admin sem a função **reprova** a varredura; o mesmo arquivo com a função, ou com exceção declarada, passa | RF-8 |
| CA-7 | A lista de exceções não cresce sem o teste reprovar, e cada entrada tem categoria e motivo | RF-9 |
| CA-8 | Nenhuma rota, tela, policy ou migration é alterada por esta tarefa | escopo |

## Fora de escopo
- **Aplicar a função nas rotas** (T3.5) e **no MCP** (T3.6, que precisa de spec própria: o token não tem usuário nem
  setor, `02-design.md` da #67 §1, F1).
- **A RLS de setor** (T4b) e o teste de duas equipes (T3.7, T8).
- **Corrigir o push de `message.received`** (pergunta P-A da T3.2): esta spec entrega o que o push precisa (decisão por
  destinatário, em lote), mas **aplicá-lo é decisão do dono**.
- **Escrita** (RF-14 da #67): a função decide **leitura**. Escrita com a mesma regra é da T4b no banco.
- Qualquer mudança de schema, de API pública ou de tela.

## Perguntas em aberto
As perguntas Q-1 a Q-7 estão em [`05-revisao.md`](05-revisao.md), com a recomendação de cada uma. As que bloqueiam o
design: **Q-1** (espelho em TypeScript ou função SQL com usuário explícito) e **Q-3** (o nome do interruptor).
