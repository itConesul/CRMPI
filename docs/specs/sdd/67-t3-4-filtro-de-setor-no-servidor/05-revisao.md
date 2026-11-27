# 05 — Revisão e aprovação

## Perguntas (**todas respondidas**, ver "Decisões" abaixo; a tabela guarda a pergunta e a recomendação como foram feitas)

| # | Pergunta | Recomendação desta spec | Por que importa |
|---|---|---|---|
| **Q-1** | O espelho da regra vive em **TypeScript** (com teste de paridade contra o SQL) ou numa **função SQL com usuário explícito** (`fn_..._for(p_user, …)`), chamada por `rpc` com `service_role`? | **TypeScript agora, com a paridade**, porque esta tarefa não tem schema (não é 🔒) e a regra pura testa sem banco. **Reavaliar na T4b**, que já reescreve a função SQL: acrescentar a variante com usuário explícito custa pouco ali e elimina a duplicação (a alternativa é mais DIRC). Se a matriz de paridade se mostrar cara de manter, adianta-se | Duplicar a regra tem fonte da verdade declarada (o SQL) e custo permanente de paridade. A variante SQL tem um *round trip* por decisão e uma migration |
| **Q-2** | A tarefa pede a lista de exceções "vazia e justificada". **Medido:** 58 arquivos com client admin (57 antes de `crm_lead_activities` entrar no conjunto) e 44 com `pg` já cairiam, então a leitura literal é impossível. Aceita a lista **completa e justificada por categoria** (`sistema` e `plataforma` por glob, permanentes; `pessoa`, `mcp` e `indeterminado` por arquivo, com **teto** que só desce)? | **Sim.** É o que "só encolhe" pode significar na prática | Decide o formato da varredura, que é o mecanismo anti-morte da tarefa |
| **Q-3** | **Qual é a chave do interruptor de setor** em `organizations.settings`? A spec da #67 diz só "o valor vive em `organizations.settings`". O TypeScript lê o mesmo valor que a T4b vai pôr no SQL | `settings.department_isolation.enabled` (booleano, **ausente = desligado**), no padrão das chaves irmãs (`visibility_mode`, `routing`, `business_hours`, `branding`, `security`). **Era proposta; virou decisão** (ver "Decisões") | Sem isso o espelho não tem o que ler, e T4b e T3.4 podem escolher nomes diferentes |
| **Q-4** | **Efeito visível ao operador, na T3.5 (não aqui):** hoje as rotas admin que servem pessoa devolvem **tudo da organização** a um `agent`, mesmo em `visibility_mode = own`, porque o client admin ignora a regra. Aplicar a função **corrige** isso e um `agent` em `own` passa a ver menos nessas rotas. É a correção pretendida? | **Sim**, e a T3.5 declara o efeito num fragmento de `.changes/`. **Dono do produto** | É mudança de comportamento para quem hoje depende do vazamento sem saber |
| **Q-5** | O **push** de `message.received` (pergunta P-A da T3.2) vai a todo assinante da organização. Esta spec entrega a decisão **por destinatário, em lote** (`carregarAtores` + `podeVerConversa`), mas **não a aplica**. Confirma que aplicar é decisão do dono, em tarefa própria? | **Sim.** A T3.4 só dá o primitivo | Evita que um PR de "função compartilhada" mude o que as pessoas recebem no celular |
| **Q-6** | O `viewer` por **sessão de suporte de leitura** (papel efetivo `viewer`) segue a regra de setor do `viewer` quando o interruptor está ligado? | **Sim**, por ser o papel efetivo (`lib/auth/require-role.ts:62-111`). Estava assumido, **não verificado**; virou decisão (ver "Decisões") | Decide se o suporte de leitura enxerga o setor alheio |
| **Q-7** | Esta tarefa **não tem issue própria**: é a T3.4 da #67. A pasta se chama `67-t3-4-filtro-de-setor-no-servidor`. Abre-se uma issue para rastrear, ou fica sob a #67? | **Fica sob a #67**, como as outras tarefas T3.x. Abre issue se o revisor preferir | O `README.md` do SDD manda `<issue>-<slug>/`; há dois diretórios com prefixo `67-` |

## Decisões
Cada resposta entra aqui, com o link de onde veio. Todas vieram do [review do Sciuba](https://github.com/itConesul/CRMPI/pull/153#pullrequestreview-6092298009) (2026-11-27 18:54Z), que relata as
decisões do dono do produto nas Q-4 e Q-5 e **concorda com a recomendação da spec** nas demais.

| Data | Pergunta | Decisão | Efeito no design | Confirmado por |
|---|---|---|---|---|
| 2026-11-27 | **Q-1** espelho em TS ou função SQL com usuário explícito | **TypeScript com paridade** (recomendação) | §2.8 e §3 como estão; a variante SQL é reavaliada na T4b | Sciuba (revisor) |
| 2026-11-27 | **Q-2** lista de exceções por categoria com teto | **Aceita** | §2.7, CA-7 | Sciuba (revisor) |
| 2026-11-27 | **Q-3** chave do interruptor | **`settings.department_isolation.enabled`** (ausente = desligado) | §2.3: o TypeScript lê essa chave; a T4b usa a mesma | Sciuba (revisor) |
| 2026-11-27 | **Q-4** a T3.5 corrige o `agent` em modo `own` ver tudo nas rotas admin | **Sim**, e o efeito vai num fragmento de `.changes/` | R-6; fica como requisito da T3.5 | **dono do produto**, via Sciuba |
| 2026-11-27 | **Q-5** aplicar a decisão no push de `message.received` | **Sim, tarefa própria e com prioridade: antes da T3.5** | `01-requisitos.md` (fora de escopo) e `04-tarefas.md` (ordem) | **dono do produto**, via Sciuba |
| 2026-11-27 | **Q-6** suporte de leitura segue a regra do `viewer` | **Sim** (recomendação) | §1 deixa de ter essa hipótese como não verificada | Sciuba (revisor) |
| 2026-11-27 | **Q-7** fica sob a #67, sem issue própria | **Sim** (recomendação) | README mantém a referência à #67 | Sciuba (revisor) |

## Comentários de review

| Data | Quem | Ponto | Como foi atendido |
|---|---|---|---|
| 2026-11-27 18:54Z | Sciuba, [review do Sciuba](https://github.com/itConesul/CRMPI/pull/153#pullrequestreview-6092298009) (`CHANGES_REQUESTED` sobre `2101149`) | **1.** `crm_lead_activities` está fora do conjunto protegido, então a varredura nunca acusaria uma leitura dela com client admin; classificar as leituras; registrar que `ai_chunks` também está fora e depende da P-B | `crm_lead_activities` **entrou** no conjunto (§1, no comando e na contagem); as leituras estão classificadas (§1: `get-lead-context` e `export-collector` → `sistema`, `leads/_handler` → `mcp`, três mistos → `indeterminado`); `ai_chunks` fica fora **por escolha**, dependente da P-B, escrito no §1 e no fora de escopo. Os números foram **refeitos e conferidos por comando**: 263 / 119 / 58 / 44. O review também lembrou da decisão D e do F6-2: a spec ganhou o primitivo `podeVerLead` (§2.2b) para a composição lead E conversa |
| idem | idem | **2.** A regra da varredura (§2.7) não cobre nome de tabela em variável (`.from(tabela)`, como o `ai/evolution`), e o R-2 prometia "string em qualquer posição" sem a regra e sem teste. Definir o que acontece, ter o caso sintético na CA-6; o mesmo para a leitura embutida | §2.7 reescrita com **as quatro formas de leitura**: `.from(<variável>)` com admin **reprova como `indeterminado-tabela`** (medido: **8 chamadas em 7 arquivos**, listadas), leitura embutida acusada (medido: 2), `.storage.from(bucket)` excluído, e a varredura passa a ser **só de leitura**. A CA-6 ganhou **um caso sintético por forma** (a a i), inclusive o helper `ler("event_log", …)` do `ai/evolution`. O R-2 foi corrigido e diz que a primeira versão prometia sem cumprir |
| idem | idem | Q-4 e Q-5 respondidas pelo dono | Registradas acima. A Q-5 mudou a ordem em `04-tarefas.md`: **o push vem antes da T3.5** |

## Aprovação
- [ ] **Spec aprovada por:** (revisor), em (data) — implementação liberada, em PR novo para a `develop`, seguindo `04-tarefas.md`
- [x] **Q-1 a Q-7** respondidas e registradas acima ([review do Sciuba](https://github.com/itConesul/CRMPI/pull/153#pullrequestreview-6092298009))
