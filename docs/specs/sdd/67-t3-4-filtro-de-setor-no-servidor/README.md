# Filtro de setor para o que roda com client admin (T3.4 da #67)

**Issue:** #67 — https://github.com/itConesul/CRMPI/issues/67 (tarefa **T3.4** de `docs/specs/sdd/67-expediente-e-setor/04-tarefas.md`; não há issue própria — ver "Perguntas em aberto", Q-7)
**Estado:** `em-revisao`  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** cMoreiraSul (com Claude)
**Medido em:** `ddc5b2b` (develop, 2026-11-27)

## Resumo
A regra "equipes distintas não veem as conversas umas das outras" vai ser garantida pelo **banco** (RLS, T4b). Mas
código que roda com `service_role` ou `pg` **não passa pela RLS**: rotas com client admin, workers, MCP e push. Esta
spec define **uma decisão única de visibilidade, em TypeScript, espelhando a regra do banco**, e **uma varredura de AST
que reprova** código novo que leia conversa, ou tabela do F6, com client admin sem passar por ela. **Esta spec não
migra nenhuma rota** (isso é a T3.5) **e não toca banco, RLS, API nem tela.**

## Documentos
| Arquivo | Conteúdo |
|---|---|
| [`01-requisitos.md`](01-requisitos.md) | O quê |
| [`02-design.md`](02-design.md) | Como (inclui a medição que o sustenta) |
| [`03-testes.md`](03-testes.md) | Prova |
| [`04-tarefas.md`](04-tarefas.md) | Ordem de implementação |
| [`05-revisao.md`](05-revisao.md) | Review e aprovação |

## Checklist de aprovação
- [ ] Cada requisito rastreia para um trecho da spec da #67 ou de uma decisão do dono
- [ ] Toda afirmação sobre o código existente cita arquivo e foi verificada (ou está em "NÃO VERIFICADO")
- [ ] Todo critério de aceite tem dono de prova em `03-testes.md`
- [ ] Fora de escopo está explícito
- [ ] Impacto em schema, RLS, API e `.changes/` declarado (aqui: nenhum)
- [ ] Living System Checklist respondido em `02-design.md`
- [ ] As perguntas Q-1 a Q-7 respondidas e registradas em `05-revisao.md`
- [ ] Revisor registrou a aprovação em `05-revisao.md`

**Nenhum código é escrito antes da aprovação.** O PR de código cita esta spec e segue `04-tarefas.md`.
