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
