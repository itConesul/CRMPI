# Agenda · visão Mês busca a mesma janela que desenha

**Issue:** #94 — https://github.com/itConesul/CRMPI/issues/94
**Estado:** `aprovada` — aprovada pelo Sciuba no review do PR #95, em 2026-11-23  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** cMoreiraSul (com Claude)
**Medido em:** `365a670` (develop)

## Resumo
A visão Mês da Agenda desenha 6 semanas (42 dias), mas só busca os agendamentos do mês corrente.
Os dias esmaecidos de outro mês aparecem vazios, mesmo com compromisso ou ocupação do Google. O
conserto é uma única função pura que define a janela, usada por quem desenha e por quem busca.

## Documentos
| Arquivo | Conteúdo |
|---|---|
| [`01-requisitos.md`](01-requisitos.md) | O quê |
| [`02-design.md`](02-design.md) | Como |
| [`03-testes.md`](03-testes.md) | Prova |
| [`04-tarefas.md`](04-tarefas.md) | Ordem de implementação |
| [`05-revisao.md`](05-revisao.md) | Review e aprovação |

## Checklist de aprovação
- [x] Cada requisito rastreia para um trecho da issue
- [x] Toda afirmação sobre o código existente cita arquivo e foi verificada
- [x] Todo critério de aceite tem dono de prova em `03-testes.md`
- [x] Fora de escopo está explícito
- [x] Impacto em schema, RLS, API e `.changes/` declarado (ou declarado como "nenhum")
- [x] Living System Checklist respondido em `02-design.md`
- [x] Revisor registrou a aprovação em `05-revisao.md`
