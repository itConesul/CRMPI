# 05 — Revisão e aprovação

## Decisões
Nada decidido ainda. Cada pergunta traz a **medição** (o que o projeto já define) e uma
**recomendação** do autor, que é proposta — a decisão é do dono do produto.

| # | Pergunta | O que o projeto já diz | Recomendação do autor | Decisão |
|---|---|---|---|---|
| Q1 | "Só o titular zera" vale para todos os papéis? Substitui o toggle ou convive? | Coluna `unread_count_for_assignee` e `fn_conversation_assign` tratam o contador como **do titular**; a issue chama a regra de "mais simples e segura" mas deixa "a decidir" | Sim, para todos; toggle **convive** como atalho do gestor (RF-2/RF-3), não como defesa | ⏳ |
| Q2 | Conversa sem dono: quem zera? | `fn_can_view_conversation` mostra a sem dono a `agent` (default) e a gestores; `claim` zera ao assumir. **Nada** define quem zera antes | **Ninguém** até assumir (RF-6). Efeito: o `agent` que só abre a conversa da fila não limpa o badge dela | ⏳ |
| Q3 | Reescrever o aceite "ticks cinzas"? | **Não existe** chamada de leitura ao provedor no código (`02-design.md` §1.3). Se o WAHA/Meta marcam "visto" sozinhos: **[NÃO VERIFICADO]** | Trocar por CA-4 ("nenhuma chamada ao provedor") e abrir tarefa separada para medir o WAHA com uma sessão real | ⏳ |
| Q4 | Auditar toda abertura ou só com o modo ativo? Qual evento emite? | `audit()` e o vocabulário existem; **não há** evento de "abrir conversa"; o `mark-read` não serve (só com `unread > 0`) | **Revisada após o review do Sciuba (pts 1 e 5):** auditar **no servidor, na leitura das mensagens**, para `manager`+ em conversa de titular humano ≠ ator, **com dedupe** de 1 linha por (org, conversa, ator) a cada 30 min. Sem rota `spy-view` (dependia do cliente). Ver `02-design.md` §2.3 | ⏳ |
| Q5 | Responder conversa alheia zera o contador do titular — mudar? | Sim, zera: `messages/_handler.ts:907` e `fn_mark_conversation_message`. **A issue não menciona.** | **Fora desta spec.** É mudança em caminho de envio e em função de banco (migration). Se quiser, abre issue própria | ⏳ ⚠️ escopo |
| Q6 | O toggle persiste? Ligado por padrão em conversa alheia? **(só vale se a Q7 mantiver o toggle)** | Não definido. A issue diz "sugerir **ou** manter o modo ativo" | Por conversa e **só na sessão da tela** (sem persistir); ligado por padrão em conversa alheia | ⏳ |

| Q7 | **O toggle fica ou sai?** (review Sciuba pt 3) Com o RF-1 o gestor não zera contador alheio com ou sem toggle; o CA-3 passaria sem ele. A issue o pede no texto | O RF-1 é a defesa; o toggle só poupa uma requisição inútil e dá ao gestor um sinal visual de "estou espiando" | **Ficar**, como UX, porque o texto da issue o pede e o gestor vê que está em supervisão. Mas a decisão é do dono, e o custo de sair está abaixo | ⏳ |

**Se o toggle SAIR (Q7 = sai):** caem RF-2, RF-3, CA-3, CA-5, a Q6, o toggle da T4 (e a T4 inteira, já
que `useMarkAsRead` passa a se decidir só pelo servidor), a linha de e2e do CA-3 e do CA-5. O RF-1
entrega o PRD sozinho. Fica no escopo: RF-1, RF-4, RF-5, RF-6. Se **ficar**, a Q6 vale como está.

## Comentários de review
Review do Sciuba em 2026-11-23, sobre `0e79ee2` (CHANGES_REQUESTED). **As threads não foram
resolvidas** — quem resolve é o revisor. Cada ponto aponta o commit que o cobre:

| # | Ponto | Resposta | Commit |
|---|---|---|---|
| 1 | Auditoria dependia do cliente | **Acatado.** Auditoria passa para o servidor, na leitura (`listMessagesHandler`); rota `spy-view` removida. Limite declarado em RNF-5 (Realtime/PostgREST) | `b12cf76` |
| 2 | RLS `conversations_agent_update` deixa `UPDATE` direto | **Acatado como limitação** (RNF-4, `02-design.md` §2.5), com teste de caracterização e T7 (issue própria). **Não** relaxei o RNF-2 | `b12cf76` |
| 3 | Toggle redundante com o RF-1 | **Virou decisão explícita (Q7)**, com a lista do que cai se sair. Não removi sozinho: a issue o pede | este commit |
| 4 | Medir `assignee_kind` e tipo de ator antes de aprovar | **Acatado e medido** (`02-design.md` §1.6): IA tem dono nulo pelo CHECK; handler recusa ator não-usuário. T0(b)/(e) fechadas | `2363cc1` |
| 5 | Volume do audit sem dedupe | **Acatado.** 1 linha por (org, conversa, ator) a cada 30 min, falha aberta | `b12cf76` |
| 6 | Como a suíte `invariants` chama a rota | **Acatado.** Ela não chama; CA-1 passa a ser e2e de API pela rota + invariante só do predicado SQL | `2363cc1` |

**Registro das decisões na #70:** o Sciuba pediu que cada decisão seja registrada na própria issue e
copiada aqui com o link. **Pendente** — depende de o dono responder Q1–Q7. Não postei nada na #70.

## Aprovação
- [ ] Q1–Q7 decididas
- [ ] Revisor aprovou a spec (data e link do review aqui)
