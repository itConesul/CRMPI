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
| RF-3 | O admin define início, fim e fuso do expediente da organização | "O que o texto pede" 2 |
| RF-4 | Fora do expediente, o papel `agent` é barrado **nas ações** (assumir, responder, receber distribuição e demais escritas de conversa): a API responde `403 OUT_OF_WORK_HOURS`. A leitura continua liberada (decisão Q1) | "O que o texto pede" 2 + "Melhorias propostas" 2 |
| RF-5 | Fora do expediente, a tela do `agent` mostra uma faixa com a janela da empresa e desabilita as ações; a faixa leva a `/fora-de-expediente`, página informativa. *(Adaptado pela Q1: o texto pedia redirecionar a tela inteira)* | "O que o texto pede" 2 + "Melhorias propostas" 2 |
| RF-6 | `admin` e `manager` **nunca** são barrados pelo expediente | "O que o texto pede" 2 |
| RF-7 | `agent` vê só conversas do **seu departamento ou sem setor** | "O que o texto pede" 3 |
| RF-8 | `admin` e `manager` veem tudo da organização | "O que o texto pede" 3 |
| RF-9 | A regra de visibilidade vale também para os eventos Realtime | "O que o texto pede" 3 |
| RNF-1 | Nenhuma isenção do gate é opcional: `admin`/`manager`, platform admin, impersonação de suporte, `cron/*` e `webhooks/*` nunca são barrados, com teste dedicado | "Melhorias propostas" 4 |
| RNF-2 | Isolamento entre organizações continua intacto; a mudança de RLS passa no teste de 2 organizações e ganha um caso por setor | "Melhorias propostas" 5 |
| RNF-3 | Mudança de schema sai como migration versionada + apêndice idempotente no `baseline.sql` + linha no MANIFEST, e **só após a aprovação** | "Regra desta issue" |
| RNF-4 | Zero dependência de LLM nesta fase | rodapé da issue |

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
- **Visibilidade de leads/contatos por setor**: o texto fala só de conversas. Ver Q6.

## Perguntas em aberto
Não decididas pela issue. **Em 2026-11-16 todas as recomendações abaixo foram adotadas** pelo autor
da spec; seguem **pendentes da confirmação do dono do produto**, que a issue exige. Decisões
registradas em [`05-revisao.md`](05-revisao.md).

1. **Q1 — Bloqueio total ou da ação?** *(decidida: só a ação)* O texto pede 403 em tudo e redirecionamento de tela; a issue
   propõe barrar só assumir/responder/receber e deixar a leitura. Recomendação: só a ação (§2).
2. **Q2 — Onde mora o expediente?** `organizations.settings.business_hours` com schema Zod central,
   ou reaproveitar `attendant_availability.schedule`. Recomendação: o primeiro (§2).
3. **Q3 — Departamento: tabela nova ou `channel_routing_*`?** Recomendação: tabela nova (§4).
4. **Q4 — Operador em um setor ou em vários?** Recomendação: vários, via tabela de vínculo (§4).
5. **Q5 — Conversa atribuída a mim em outro setor** (ex.: depois de uma transferência): continua
   visível? Recomendação: sim, o dono sempre vê (§4.3).
6. **Q6 — Leads e contatos entram no isolamento por setor?** O texto cobre conversas e mensagens.
   Recomendação: não neste PRD; abrir issue própria se o dono quiser.
7. **Q7 — Mensagem que chega com todos os atendentes barrados**: quem responde? A conversa fica sem
   dono até a abertura. Depende do PRD-07 para o cliente receber aviso (§7, §8).
8. **Q8 — Domingo/feriado**: o expediente é por dia da semana (`windows` com `dow`), como no horário
   por atendente? Feriado fica fora. Recomendação: por dia da semana, sem feriado.
