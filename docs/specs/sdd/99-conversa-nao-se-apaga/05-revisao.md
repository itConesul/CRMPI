# 05 — Revisão e aprovação

## Decisões
Tomadas pelo dono do produto em 2026-11-24 e registradas na #99 pelo Sciuba:

| Data | Pergunta / mudança | Decisão | Onde |
|---|---|---|---|
| 2026-11-24 | Apagar contato com conversa (opções a/b/c) | **(b)**: 409 orientando a anonimizar. Contato sem conversa continua apagável | [#99, decisões](https://github.com/itConesul/CRMPI/issues/99#issuecomment-7132870076) |
| 2026-11-24 | Escopo da #99 (A, B+, C, D) | **B+**; exclusão lógica (D) em issue separada; RPC do contador (C) fora | idem |
| 2026-11-24 | Quem apaga contato | **Só `manager` ou `admin`.** Rota a `manager`, botão some para `agent`/`viewer`, teste de 403 | [#99, pedido da spec](https://github.com/itConesul/CRMPI/issues/99#issuecomment-7133157545) |
| 2026-11-24 | Mensagem do 409 | Orienta **pedir a um administrador**, não "anonimize": anonimizar exige `admin` (+ MFA) | idem |
| 2026-11-24 | Processo | A #99 ganha spec SDD própria, em PR de spec, **antes** de qualquer migration; T0 = prova do `viewer` e da sessão de suporte | idem |

## Perguntas ao revisor
| # | Pergunta | Recomendação do autor |
|---|---|---|
| P1 | O fragmento é `exige_acao` (a régua trata "algo que existia mudou de forma" assim) ou `nada_mudou`/`alterado`? O primeiro implica um release **major** | Seguir a letra da régua: `exige_acao`, com "Requer atenção". É o dono do release quem decide |
| P2 | `manager`+ inclui `platform admin` e sessão de suporte na tela? | **Medido (T0b, `02-design.md` §1.3):** sessão de suporte `full` conta como `admin` e passa; suporte só leitura e `platform admin` sem membership **não** passam. A tela espelha a rota e **não** soma `is_platform_admin`. Confirme que é isso que se quer |
| P3 | Quer que o título da #99 mude? Ela nasceu como "`agent`+ faz `UPDATE` direto", e o `UPDATE` **segue aberto** neste escopo | Retitular ou deixar a #99 aberta até C/D, para não fechar por engano |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|

## Aprovação
- [ ] **Aprovada por:** <nome> em <AAAA-MM-DD> — implementação liberada
