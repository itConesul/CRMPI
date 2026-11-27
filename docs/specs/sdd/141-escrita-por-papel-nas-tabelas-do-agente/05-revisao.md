# 05 — Revisão e aprovação

## Decisões
| Data | Pergunta / mudança | Decisão | Quem |
|---|---|---|---|
| 2026-11-27 | P1: alcance (3 tabelas ou o laço inteiro) | **Todas as tabelas do laço** | Sciuba, dono do produto |
| 2026-11-27 | P2: aviso do quadro para `viewer` | **Aceito:** o aviso nasce quando um `agent`+ abre o quadro | Sciuba, dono do produto |
| 2026-11-27 | P3: `impacto` do fragmento | **`nada_mudou`, seção `corrigido`** | Sciuba, dono do produto |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|
| 2026-11-27 | Claude, a pedido de Sciuba | O "client do contexto MCP" não era nomeado | `02-design.md` §1: é o client admin nos pontos conferidos |
| 2026-11-27 | Claude, a pedido de Sciuba | Faltava o par do risco de `cron_jobs` para `agent_inbox_items` | `02-design.md` §7 |
| 2026-11-27 | cMoreiraSul | A aprovação registrada não passou por revisor independente do autor (condição para o merge) | Seção "Aprovação" abaixo; estado volta a `em-revisao` |
| 2026-11-27 | cMoreiraSul | A `0241` está no #145 | `02-design.md` §4: próximo número livre |
| 2026-11-27 | cMoreiraSul | Sobreposição com o #145 em `outbound_copies` | `02-design.md` §4 |
| 2026-11-27 | cMoreiraSul | Provar todas as tabelas, e2e dos quatro caminhos, `job_id`, log da recusa e ordem `revoke`/`grant` | Obrigações da implementação: `03-testes.md` e `04-tarefas.md` |

## Aprovação
**Revisor independente:** cMoreiraSul. A aprovação é o review `APPROVED` dele no
[PR #143](https://github.com/itConesul/CRMPI/pull/143), sobre o commit final da spec. Com esse review
e o merge, a implementação está liberada; sem ele, não. Registrar assim evita um commit depois da
aprovação, que a derrubaria. O primeiro commit da implementação marca o estado `implementando` e
anota a data.

Sciuba é autor e dono do produto: decide P1 a P3 acima, mas não aprova a própria spec.

## Implementação
**Aprovação confirmada em 2026-11-27:** review `APPROVED` de cMoreiraSul no PR #143, sobre `756cfbf`;
merge `692e4d0`. Estado `implementando` a partir desta data.

**Migration:** `0243`. A `0241` é do #145 e a `0242` é do #147; os dois entraram na `develop` durante
a implementação.

**Relação com #145 e #147:** o #145 revoga todo o acesso da sessão a `outbound_copies` e
`ai_invocations`; o #147 faz o mesmo com `lead_state_transitions`, `event_log` e
`ai_router_decisions`. Esta mudança só revoga escrita, é idempotente e vale em qualquer ordem. O
conflito no fim do `baseline.sql` foi resolvido mantendo os blocos `0241`, `0242` e `0243`, nessa
ordem. O caso "a leitura não mudou" do invariante declara as duas tabelas do laço que perderam também
a leitura (`outbound_copies` e `lead_state_transitions`).

### E2E dos quatro caminhos (T1)
| Caminho | Spec e2e no CI | Como fica provado |
|---|---|---|
| Decidir a próxima ação (`leads/[id]/next-action`) | **nenhuma** | Invariante CA-2: o mesmo `update`, como `authenticated` com o JWT do papel |
| Devolver ao automático (`conversations/[id]/reactivate-bot`) | `escalacao-ciclo.spec.ts` clica o botão, mas **não confere o checkpoint**: a recusa só iria para o log | Invariante CA-3: o mesmo `insert` |
| Aceitar reativação (`leads/[id]/reactivation`) | **nenhuma** | Invariante CA-3 |
| Aviso de proposta ambígua (`pipelines/[id]/board`) | **nenhuma** (`gatilho-de-etapa` lê o quadro sem proposta ambígua) | Invariante CA-3 e `tests/unit/quadro-aviso-recusado-vai-para-o-log.test.ts` |

**Não provado:** nenhum dos quatro foi exercitado pela tela contra o banco já restrito conferindo a
linha gravada. O invariante roda o SQL equivalente, sem passar pelo PostgREST.

### Escritores além da busca textual
Catálogo do banco instalado: nenhuma função sem `security definer` escreve nas tabelas do laço,
nenhuma usa SQL dinâmico e nenhuma view sobre elas dá escrita a `authenticated`. No código, os
`.from(variável)` que escrevem apontam para outras tabelas. O apagamento de contato continua
cascateando para as tabelas do laço (caso próprio no invariante).
