# Escrita aberta nas tabelas do agente: exigir papel no banco

**Issue:** #141 — https://github.com/itConesul/CRMPI/issues/141
**Estado:** `aprovada`  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** Sciuba (com Claude)
**Medido em:** `23df681` (develop, 2026-11-27)

## Resumo
As tabelas do laço de policies do motor do agente no `baseline.sql` só filtram por organização. Um
`viewer` altera, apaga e insere nelas direto pela API do banco. Esta spec tira a escrita do usuário
logado em todas e devolve só os quatro caminhos que o app usa, exigindo `agent` ou acima.

## Documentos
| Arquivo | Conteúdo |
|---|---|
| [`01-requisitos.md`](01-requisitos.md) | O quê |
| [`02-design.md`](02-design.md) | Como |
| [`03-testes.md`](03-testes.md) | Prova |
| [`04-tarefas.md`](04-tarefas.md) | Ordem de implementação |
| [`05-revisao.md`](05-revisao.md) | Review e aprovação |

## Checklist de aprovação
- [ ] Cada requisito rastreia para um trecho da issue
- [ ] Toda afirmação sobre o código existente cita arquivo e foi verificada
- [ ] Todo critério de aceite tem dono de prova em `03-testes.md`
- [ ] Fora de escopo está explícito
- [ ] Impacto em schema, RLS, API e `.changes/` declarado
- [ ] Living System Checklist respondido em `02-design.md`
- [ ] Revisor registrou a aprovação em `05-revisao.md`
