# <Título da issue>

**Issue:** #<N> — <link>
**Estado:** `rascunho`  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** <quem escreveu a spec>
**Medido em:** `<SHA curto da develop>`

## Resumo
<Duas ou três linhas: o problema e o resultado esperado.>

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
- [ ] Impacto em schema, RLS, API e `.changes/` declarado (ou declarado como "nenhum")
- [ ] Living System Checklist respondido em `02-design.md`
- [ ] Revisor registrou a aprovação em `05-revisao.md`
