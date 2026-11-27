# Notas internas: ler só quem vê a conversa, e chegar ao vivo

**Issue:** #137 — https://github.com/itConesul/CRMPI/issues/137
**Estado:** `em-revisao`  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** Sciuba (com Claude)
**Medido em:** `4cd5d10` (develop, 2026-11-27)

## Resumo
`conversation_notes` não está na publicação do Realtime, então o aviso de menção na tela e a nota ao
vivo não funcionam. E a política de leitura só exige ser membro da organização: quem não vê a conversa
lê as notas dela. Esta spec aperta o acesso e **só depois** publica a tabela, na mesma migration.

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
