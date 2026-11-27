# 04 — Tarefas

Só começa depois da aprovação descrita em `05-revisao.md` (review `APPROVED` do revisor independente
e merge do PR da spec).

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T1 | Nomear o e2e de cada um dos quatro caminhos; invariante vermelho: `viewer` escreve em cada tabela; casos das quatro exceções | RF-1 a RF-4 | CA-1 a CA-3, CA-5 | [ ] |
| T2 | Migration, apêndice no `baseline.sql` e `MANIFEST.md`; invariante verde e sabotagem | RF-1 a RF-4, RNF-1 | CA-4 | [ ] |
| T2b | `avisaAmbiguas` registra no log a recusa `42501` | RF-3 | teste unitário | [ ] |
| T3 | `pnpm test:db` completo; ajustar invariantes que dependiam da escrita aberta, justificando cada um | RNF-2 | CA-4 | [ ] |
| T4 | Fragmento em `.changes/` (conforme P3) e busca de afirmações de estado nos docs de autoridade | DoD 16 e 17 | `pnpm release:conferir` | [ ] |
