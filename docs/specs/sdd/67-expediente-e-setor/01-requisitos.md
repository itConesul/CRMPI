# 01 — Requisitos

## Problema
Fonte: issue #67 (PRD-01, Fase 1 — substituição do ChatGuru, WhatsApp sem IA). Atendentes só devem
operar dentro do horário comercial da empresa, com bloqueio **no servidor**, e cada departamento
deve enxergar só os atendimentos do seu setor. É a base de PRD-02, PRD-06 e PRD-07, que dependem dos
departamentos e do expediente definidos aqui.

## Requisitos

| ID | Requisito | Origem na issue |
|---|---|---|
| RF-1 | O admin cadastra departamentos (ex.: Comercial, Financeiro, Suporte) | "O que o texto pede" 1 |
| RF-2 | O admin vincula operadores a um setor | "O que o texto pede" 1 |
| RF-3 | O admin define início, fim e fuso do expediente da organização. O expediente **pode virar o dia** (`end < start`, ex.: 22:00–06:00); a janela pertence ao `dow` em que **começa**, e `start == end` é inválido (N3) | "O que o texto pede" 2 + decisão do dono do produto (2026-11-17) |
| RF-4 | Fora do expediente, o papel `agent` é barrado **nas ações**: a API responde `403 OUT_OF_WORK_HOURS`. **Fail-closed:** todo método que não seja `GET`/`HEAD`/`OPTIONS` é barrado **por padrão** (assumir, responder, receber distribuição e demais escritas), e só escapa quem consta numa lista de isenções **com motivo escrito**. A leitura continua liberada (decisão Q1) | "O que o texto pede" 2 + "Melhorias propostas" 2 + decisão do dono do produto (2026-11-17) |
| RF-5 | Fora do expediente, a tela do `agent` mostra uma faixa com a janela da empresa e desabilita as ações; a faixa leva a `/app/fora-de-expediente`, página informativa. *(Adaptado pela Q1: o texto pedia redirecionar a tela inteira)* | "O que o texto pede" 2 + "Melhorias propostas" 2 |
| RF-6 | `admin` e `manager` **nunca** são barrados pelo expediente (bypass **auditado**, RF-10) | "O que o texto pede" 2 + decisão de produto (comentário de 2026-11-13) |
| RF-7 | `agent` vê só conversas do **seu departamento ou sem setor** | "O que o texto pede" 3 |
| RF-8 | `admin` e `manager` veem tudo da organização | "O que o texto pede" 3 |
| RF-9 | A regra de visibilidade vale também para os eventos Realtime | "O que o texto pede" 3 |
| RF-10 | Quando `admin` ou `manager` — e também **platform admin e sessão de suporte** (decisão de 2026-11-23) — age **fora do expediente**, a ação é registrada como tal na auditoria: a própria linha de `api_audit_log` da mutação ganha `metadata.fora_do_expediente = true`. Não nasce linha nova, e dentro do expediente nada muda. **Vale para ator humano de sessão** (`actor_user_id` sem `actor_api_token_id`) **numa organização**: worker, cron, Bearer, MCP, IA e ingestão ficam de fora — não passam pelo gate (RNF-1) e não têm sessão. **A falha em descobrir se é fora do expediente nunca bloqueia a mutação nem o audit:** perde-se só o campo | Decisão de produto (comentário de 2026-11-13): "bypass, com auditoria". O escopo de ator e a falha que só perde o campo foram propostos em 2026-11-18 e **aceitos pelo dono do produto em 2026-11-23** (`05-revisao.md`, [#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-7105707792)) |
| RF-11 | Fora do expediente, a mensagem do cliente **entra normalmente** (a conversa é criada/atualizada e fica na fila, sem dono); o expediente não toca a ingestão. A resposta automática de ausência é do PRD-07 (#73) | Decisão de produto (comentário de 2026-11-13) |
| RF-12 | Fora do expediente, o `agent` **não entra na distribuição**: a elegibilidade do roteamento passa a exigir expediente da organização **e** a janela própria do atendente (hoje só exige a segunda) | Decisão de produto (comentário de 2026-11-13) + RF-4 |
| RF-13 | Um setor **com conversas não pode ser apagado**: a API responde `409 department_not_empty` com a contagem, e o admin reatribui as conversas explicitamente antes. Apagar um setor nunca devolve conversas a "sem setor" em silêncio (N1) | Decisão do dono do produto (2026-11-17) |
| RF-14 | A regra de setor vale **também na escrita**: `agent` não faz `UPDATE`/`DELETE` em conversa nem `INSERT`/`UPDATE`/`DELETE` em `messages` de uma conversa que não enxerga, e não muda o `department_id` de uma conversa (N2) | Decisão do dono do produto (2026-11-17) |
| RNF-1 | Nenhuma isenção do gate é opcional: `admin`/`manager`, platform admin e impersonação de suporte nunca são barrados, e ficam **fora do gate** (por escrito e com teste de varredura) token Bearer, MCP, agente de IA, `webhooks/*`, `cron/*` e a ingestão de mensagens. Isenções fixas do `agent`: leitura, login/logout, troca de organização, perfil, preferências, MFA, marcar notificação como lida, presença e `attendants/availability`. CRM interno (leads, contatos, tarefas, agenda) é barrado por padrão e liberado rota a rota, com o critério "dispara mensagem ao cliente?" | "Melhorias propostas" 4 |
| RNF-2 | Isolamento entre organizações continua intacto; a mudança de RLS passa no teste de 2 organizações e ganha um caso por setor | "Melhorias propostas" 5 |
| RNF-3 | Mudança de schema sai como migration versionada + apêndice idempotente no `baseline.sql` + linha no MANIFEST, e **só após a aprovação** | "Regra desta issue" |
| RNF-4 | Zero dependência de LLM nesta fase | rodapé da issue |
| RNF-5 | A tentativa barrada pelo expediente **não grava uma linha de audit por tentativa** (retry e polling da UI inflariam o log, como nas rodadas de cron vazias). Conta-se em contador agregado por organização e dia; a falta do contador (Redis fora) nunca bloqueia nem barra ninguém (N4). **A chave do contador nunca fica sem validade por falha parcial**, e o contador **tem leitor nomeado** (ou não é escrito) — ambos em `02-design.md` §2.1; o segundo pende da escolha do dono do produto (`05-revisao.md`) | Decisão do dono do produto (2026-11-17) + CLAUDE.md ("auditar quando houve efeito") |

## Critérios de aceite (verbatim da issue)

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | `agent` às 22h com expediente 08–18 é barrado | RF-3, RF-4, RF-5, RF-6 |
| CA-2 | operador de *Suporte* não vê conversa de *Comercial* nem recebe seus eventos Realtime | RF-2, RF-7, RF-8, RF-9 |

## Fora de escopo
Da issue:
- Nenhum item explícito além da regra "alinhar o banco antes de implementar".

Acréscimos desta spec (deixados implícitos pela issue):
- **Distribuição por setor, transferência e SLA** → PRD-02 (#68).
- **URA de triagem e mensagem fora do expediente ao cliente** → PRD-07 (#73). Este PRD só barra o
  atendente; o que o **cliente** recebe fora do horário é do PRD-07.
- **Horário do agente de IA** (`janela-de-atendimento.ts`) e **horário por atendente** na
  elegibilidade do roteamento: continuam como estão.
- **Visibilidade de leads/contatos por setor**: o texto fala só de conversas. Ver Q6. **Risco aceito
  pelo dono do produto (2026-11-17):** a timeline, as atividades e o 360 do contato podem mostrar
  conteúdo de conversa de outro setor. Mapeado na [#80](https://github.com/itConesul/CRMPI/issues/80).
- **Expediente por setor** (`departments.business_hours`): evolução prevista e aditiva, **não** desta
  spec (Q9).

## Perguntas
Em 2026-11-16 o autor adotou as recomendações abaixo; em 2026-11-13 e 2026-11-17 o **dono do produto
as confirmou** (ver cada item e [`05-revisao.md`](05-revisao.md), que é a fonte e prevalece se
divergir). Nenhuma está mais em aberto; N1 a N4 são decisões novas do mesmo dia.

1. **Q1 — Bloqueio total ou da ação?** *(decidida: só a ação; **confirmada pelo dono do produto** em
   2026-11-13, [comentário na #67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6860649540))*
   O texto pede 403 em tudo e redirecionamento de tela; a issue propõe barrar só
   assumir/responder/receber e deixar a leitura. Recomendação: só a ação (§2).
2. **Q2 — Onde mora o expediente?** *(✅ aprovada em 2026-11-17)* `organizations.settings.business_hours`
   com schema Zod central, ou reaproveitar `attendant_availability.schedule`. Decisão: o primeiro (§2).
3. **Q3 — Departamento: tabela nova ou `channel_routing_*`?** *(✅ aprovada em 2026-11-17)* Decisão:
   tabela nova (§4).
4. **Q4 — Operador em um setor ou em vários?** *(✅ aprovada em 2026-11-17)* Decisão: vários, via
   tabela de vínculo (§4).
5. **Q5 — Conversa atribuída a mim em outro setor** (ex.: depois de uma transferência): continua
   visível? *(✅ aprovada em 2026-11-17)* Decisão: sim, o dono sempre vê (§4.3).
6. **Q6 — Leads e contatos entram no isolamento por setor?** *(✅ fora do escopo, com **risco aceito**,
   em 2026-11-17; mapeado na #80)* O texto cobre conversas e mensagens.
7. **Q7 — Mensagem que chega com todos os atendentes barrados**: quem responde? A conversa fica sem
   dono até a abertura. Depende do PRD-07 para o cliente receber aviso (§7, §8). *(**Confirmada pelo
   dono do produto** em 2026-11-13: "a mensagem do cliente entra normalmente na fila; a resposta
   automática de ausência vem no PRD-07". Virou RF-11.)*
8. **Q8 — Domingo/feriado**: o expediente é por dia da semana (`windows` com `dow`), como no horário
   por atendente? Feriado fica fora. *(✅ aprovada em 2026-11-17: por dia da semana, sem feriado.)*
9. **Q9 — O expediente é da organização ou de cada setor?** *(✅ decidida em 2026-11-17: **por
   organização agora**.)* A evolução prevista é `departments.business_hours jsonb` nullable, com
   fallback para o expediente da organização — aditiva, sem backfill, não quebra o `update.sh`. Fica
   registrada em `02-design.md` §4.1 e **não** é implementada por esta spec.
