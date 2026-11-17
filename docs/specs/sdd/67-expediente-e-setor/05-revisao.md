# 05 — Revisão e aprovação

## Decisões
Em 2026-11-16 o autor da spec (cMoreiraSul) **adotou todas as recomendações** abaixo. Elas são a
base do design atual, mas a issue #67 exige a aprovação do **dono do produto**: a coluna "Confirmado
pelo dono do produto" fica `_pendente_` até essa confirmação. **Q1 e Q7 já foram confirmadas** no
[comentário de `Sciuba` na #67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6860649540)
(2026-11-13, "Decidido pelo dono do produto"). Isso **não** aprova a proposta de schema (§4 de
`02-design.md`): o próprio comentário diz que qualquer tabela ou coluna continua sujeita à proposta
postada e à aprovação explícita.

| Data | Pergunta | Decisão adotada | Efeito no design | Confirmado pelo dono do produto |
|---|---|---|---|---|
| 2026-11-16 | Q1: bloqueio total ou só da ação? | **Só a ação.** A leitura fica liberada | O `agent` fora do expediente lê, mas não assume, responde, transfere, anota, solta, adia nem encerra. Gate por `exigeExpediente` nas rotas de ação; faixa na tela em vez de redirecionamento. RF-4 e RF-5 reescritos | ✅ 2026-11-13 (comentário na #67) |
| 2026-11-16 | Q2: onde mora o expediente? | `organizations.settings.business_hours` | Sem coluna nova; reusa o formato e as funções do horário por atendente | _pendente_ |
| 2026-11-16 | Q3: departamento | Tabela `departments` nova | `channel_routing_*` fica como está (por número) | _pendente_ |
| 2026-11-16 | Q4: operador em quantos setores? | Vários | Tabela de vínculo `department_members` (N:N) | _pendente_ |
| 2026-11-16 | Q5: dono vê a conversa de outro setor? | Sim | A regra de dono vem antes da de setor em `fn_can_view_conversation` | _pendente_ |
| 2026-11-16 | Q6: leads e contatos no isolamento? | Não neste PRD | Fora de escopo; issue própria se o dono quiser | _pendente_ |
| 2026-11-16 | Q7: conversa com todos barrados | Fica sem dono até a abertura; o aviso ao cliente é do PRD-07 | Registrado como risco, sem solução neste PRD. Virou RF-11 | ✅ 2026-11-13 (comentário na #67) |
| 2026-11-16 | Q8: granularidade do expediente | Por dia da semana, sem feriado | `windows` com `dow`, como no horário por atendente | _pendente_ |
| 2026-11-17 | Q9: expediente da organização ou de cada setor? | **Aberta.** Recomendação: por organização agora | O comentário do dono do produto cita "expediente por setor"; a spec guarda um por organização (§4.1). Por setor mudaria o §4 | _pendente_ |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|
| 2026-11-13 | Sciuba (decisão do dono do produto, [#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6860649540)) | Expediente bloqueia ações, não a leitura; fora dele o atendente não entra na distribuição nem assume/responde; continua vendo lista e histórico; `admin`/`manager` com bypass **com auditoria**; mensagem do cliente entra na fila, resposta automática é do PRD-07; servidor recusa assumir/enviar e a UI mostra o motivo | Incorporado em 2026-11-17: **RF-10** (bypass auditado), **RF-11** (ingestão intocada), **RF-12** (distribuição), tarefa **T2b**, Q1 e Q7 confirmadas. RF-4 e RF-5 já cobriam "servidor recusa" e "UI mostra o motivo". Ficou **aberta** a Q9 |

## Aprovação
- [ ] **Proposta de schema (`02-design.md` §4) aprovada por:** <nome> em <AAAA-MM-DD> — migration liberada
- [ ] **Spec aprovada por:** <nome> em <AAAA-MM-DD> — implementação liberada
