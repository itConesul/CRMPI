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
| Q6 | O toggle persiste? Ligado por padrão em conversa alheia? | Não definido. A issue diz "sugerir **ou** manter o modo ativo" | Por conversa e **só na sessão da tela** (sem persistir); ligado por padrão em conversa alheia | ⏳ |

## Comentários de review
_(vazio — aguardando)_

## Aprovação
- [ ] Q1–Q6 decididas
- [ ] Revisor aprovou a spec (data e link do review aqui)
