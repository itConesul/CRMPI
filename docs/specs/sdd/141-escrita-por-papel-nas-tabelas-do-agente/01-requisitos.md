# 01 — Requisitos

## Problema
Da [#141](https://github.com/itConesul/CRMPI/issues/141), passo 1 do plano da #67: `lead_state`,
`lead_state_transitions` e `outbound_copies` têm uma policy `for all` filtrada só por organização,
com `revoke` apenas de `anon`. Qualquer membro ativo, `viewer` inclusive, altera e apaga essas
linhas sem passar pelo app.

A issue mediu por leitura. Esta spec **executou** (`02-design.md` §1), confirmou, e viu que o alcance
inclui outras tabelas do mesmo laço.

## Requisitos

| ID | Requisito | Origem na issue |
|---|---|---|
| RF-1 | `viewer` não insere, altera nem apaga em `lead_state`, `lead_state_transitions` e `outbound_copies` | "Problema"; "O que fazer" item 1 |
| RF-2 | A decisão de próxima ação (`leads/[id]/next-action`) continua funcionando para `agent`+ | "O que fazer" item 2 |
| RF-3 | Os demais escritores que usam a sessão do usuário continuam funcionando para quem tem o papel | "Conferir os demais escritores antes de revogar" |
| RF-4 | As outras tabelas do mesmo laço seguem a mesma regra (P1: todas) | "O que fazer" item 3 |
| RNF-1 | Migration versionada, apêndice idempotente no `baseline.sql` e linha no `MANIFEST.md` | "O que fazer" item 4 |
| RNF-2 | O motor do agente (conexão direta) e as rotas com client admin não mudam de comportamento | "Escrita só para quem precisa" |

## Critérios de aceite
A issue não traz critérios; os abaixo derivam de "O que fazer" **(acréscimo da spec)**.

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | Um invariante, vermelho antes da migration, mostra `viewer` sem conseguir `insert`, `update` e `delete` nas tabelas cobertas | RF-1, RF-4 |
| CA-2 | `agent` aprova e descarta a próxima ação | RF-2 |
| CA-3 | Para `agent`: checkpoint de retomada, follow-up de reativação aceita e aviso de proposta ambígua continuam sendo gravados | RF-3 |
| CA-4 | `pnpm test:db` verde nos modos install e update | RNF-1 |
| CA-5 | Uma tabela nova que entre no laço sem a restrição reprova o invariante **(acréscimo da spec)** | RF-4 |

## Fora de escopo
- A **leitura** por departamento (T3 e T4b da #67). Esta spec não muda nenhum `select`.
- A exclusão direta de contato (pedida no review do #140).
- Tabelas fora deste laço **(acréscimo da spec)**.

## Perguntas (decididas em 2026-11-27, ver `05-revisao.md`: valeu a recomendação nas três)
| ID | Pergunta | Recomendação |
|---|---|---|
| P1 | Corrigir só as 3 tabelas da issue ou todas as do laço? | **Todas.** O mesmo defeito atinge a fila de jobs, os agendamentos e as tabelas de proteção do agente |
| P2 | O `viewer` que abre o quadro deixa de gerar o aviso de proposta com mais de um negócio. Aceita? | **Sim.** O aviso nasce quando um `agent`+ abre o quadro. A alternativa é gravar com client admin |
| P3 | `impacto` do fragmento em `.changes/` | **`nada_mudou`, seção `corrigido`.** Nenhuma tela perde função; só deixa de funcionar a escrita direta na API com login de usuário. Na #99 a escolha foi `exige_acao`, lá porque um botão sumiu |
