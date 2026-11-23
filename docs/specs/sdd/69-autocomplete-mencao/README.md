# PRD-03 · Autocomplete de `@usuário` nas notas internas

**Issue:** #69 — https://github.com/itConesul/CRMPI/issues/69
**Estado:** `aprovada`  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** cMoreiraSul (com Claude)
**Medido em:** `365a670` (`origin/develop`, 2026-11-19)
**Aprovação:** Sciuba (dono do produto), 2026-11-23, review do PR #89 · mergeado na `develop` em 2026-11-23, `9defd7b` — detalhes em [`05-revisao.md`](05-revisao.md)

## Resumo
Notas internas, o aviso `mention` em tempo real e o card âmbar **já existem**. Falta só o
**autocomplete do `@`**: hoje quem escreve a nota precisa adivinhar como o servidor casa o nome.
Esta spec propõe uma lista de membros que o atendente seleciona ao digitar `@` no modo nota,
reusando `GET /api/v1/team/assignable` e o parser de menção já testado — **sem schema, sem rota
nova, sem dependência nova** (sem TipTap).

## Documentos
| Arquivo | Conteúdo |
|---|---|
| [`01-requisitos.md`](01-requisitos.md) | O quê, rastreado à issue, e as perguntas em aberto |
| [`02-design.md`](02-design.md) | Como: o que existe (medido), decisão, riscos |
| [`03-testes.md`](03-testes.md) | Critério → prova |
| [`04-tarefas.md`](04-tarefas.md) | Ordem de implementação |
| [`05-revisao.md`](05-revisao.md) | Decisões e aprovação |

## Checklist de aprovação
Marcado em 2026-11-23, após a aprovação do Sciuba no PR #89 (ele leu a spec inteira e conferiu as afirmações sobre o código).
- [x] Cada requisito rastreia para um trecho da issue
- [x] Toda afirmação sobre o código existente cita arquivo e foi verificada
- [x] Todo critério de aceite tem dono de prova em `03-testes.md`
- [x] Fora de escopo está explícito
- [x] Impacto em schema, RLS, API e `.changes/` declarado (ou declarado como "nenhum")
- [x] Living System Checklist respondido em `02-design.md`
- [x] Revisor registrou a aprovação em `05-revisao.md`
