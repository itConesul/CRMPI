# 05 — Revisão e aprovação

## Decisões
**Decididas pelo dono do produto em 2026-11-23**, registradas na #70 pelo Sciuba:
- Q1 a Q7 (todas como recomendadas): https://github.com/itConesul/CRMPI/issues/70#issuecomment-7105707217
- **Correção de Q6 e Q7** (15:31 → 16:03): o toggle vira selo fixo, Q6 cai: https://github.com/itConesul/CRMPI/issues/70#issuecomment-7106544539
- **Complemento de Q5 e Q7** (16:07): selo neutro, gestor vira titular, Q5 escrita na spec: https://github.com/itConesul/CRMPI/issues/70#issuecomment-7106632261

Onde a recomendação do autor e a decisão diferem, **vale a decisão** (coluna da direita; o histórico
fica na linha). Cada pergunta traz a **medição** (o que o projeto já define) e a recomendação original.

| # | Pergunta | O que o projeto já diz | Recomendação do autor | Decisão |
|---|---|---|---|---|
| Q1 | "Só o titular zera" vale para todos os papéis? Substitui o toggle ou convive? | Coluna `unread_count_for_assignee` e `fn_conversation_assign` tratam o contador como **do titular**; a issue chama a regra de "mais simples e segura" mas deixa "a decidir" | Sim, para todos; toggle **convive** como atalho do gestor (RF-2/RF-3), não como defesa | ✅ [decisão do dono](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7105707217) |
| Q2 | Conversa sem dono: quem zera? | `fn_can_view_conversation` mostra a sem dono a `agent` (default) e a gestores; `claim` zera ao assumir. **Nada** define quem zera antes | **Ninguém** até assumir (RF-6). Efeito: o `agent` que só abre a conversa da fila não limpa o badge dela | ✅ [decisão do dono](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7105707217) |
| Q3 | Reescrever o aceite "ticks cinzas"? | **Não existe** chamada de leitura ao provedor no código (`02-design.md` §1.3). Se o WAHA/Meta marcam "visto" sozinhos: **[NÃO VERIFICADO]** | Trocar por CA-4 ("nenhuma chamada ao provedor") e abrir tarefa separada para medir o WAHA com uma sessão real | ✅ [decisão do dono](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7105707217) |
| Q4 | Auditar toda abertura ou só com o modo ativo? Qual evento emite? | `audit()` e o vocabulário existem; **não há** evento de "abrir conversa"; o `mark-read` não serve (só com `unread > 0`) | **Revisada após o review do Sciuba (pts 1 e 5):** auditar **no servidor, na leitura das mensagens**, para `manager`+ em conversa de titular humano ≠ ator, **com dedupe** de 1 linha por (org, conversa, ator) a cada 30 min. Sem rota `spy-view` (dependia do cliente). Ver `02-design.md` §2.3 | ✅ [decisão do dono](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7105707217) |
| Q5 | Responder conversa alheia zera o contador do titular — mudar? | Sim, zera: `messages/_handler.ts:907` e `fn_mark_conversation_message`. **A issue não menciona.** | **Fora desta spec.** É mudança em caminho de envio e em função de banco (migration). Se quiser, abre issue própria | ✅ fora de escopo: [decisão](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7105707217), [complemento](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7106632261) |
| Q6 | O toggle persiste? Ligado por padrão em conversa alheia? | Não definido. A issue diz "sugerir **ou** manter o modo ativo" | — | ❌ **removida**: sem toggle não há estado a persistir. [#70](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7106544539) |
| Q7 | O toggle fica ou sai? (review Sciuba pt 3) | Com o RF-1 o gestor não zera contador alheio com ou sem toggle | Ficar, como UX (recomendação original) | ✅ **revista duas vezes.** Primeiro "fica" ([#70](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7105707217)); depois **vira selo fixo, só indicador** ([#70](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7106544539)); depois o selo é **neutro**, "Conversa de <titular>", porque o gestor também responde e transfere ([#70](https://github.com/itConesul/CRMPI/issues/70#issuecomment-7106632261)) |

**Efeito da Q7 revista:** RF-2 descreve o selo; RF-3/CA-3 não dependem de controle; CA-5 verifica o
selo e o texto neutro; **CA-9 novo** (gestor vira titular por `claim`/`transfer`: o selo some e o
`mark-read` zera para ele); T4 troca "toggle" por "selo". Q6 sai. O RF-1 continua sendo a defesa.

## Comentários de review
Review do Sciuba em 2026-11-23, sobre `0e79ee2` (CHANGES_REQUESTED). **As threads não foram
resolvidas** — quem resolve é o revisor. Cada ponto aponta o commit que o cobre:

| # | Ponto | Resposta | Commit |
|---|---|---|---|
| 1 | Auditoria dependia do cliente | **Acatado.** Auditoria passa para o servidor, na leitura (`listMessagesHandler`); rota `spy-view` removida. Limite declarado em RNF-5 (Realtime/PostgREST) | `b12cf76` |
| 2 | RLS `conversations_agent_update` deixa `UPDATE` direto | **Acatado como limitação** (RNF-4, `02-design.md` §2.5), com teste de caracterização e T7 (issue própria). **Não** relaxei o RNF-2 | `b12cf76` |
| 3 | Toggle redundante com o RF-1 | **Virou decisão explícita (Q7)**, com a lista do que cai se sair. Não removi sozinho: a issue o pede. **Depois resolvido pelo dono: selo fixo e neutro** (ver as 3 linhas abaixo) | `67c6742`, `2ad9f3f` |
| 7 | **Pós-aprovação (16:03):** toggle → selo fixo, só indicador; Q6 cai; RF-2, RF-3/CA-3, CA-5 e T4 mudam | **Acatado.** RF-2 descreve o selo, CA-5 o verifica, T4 troca "toggle" por "selo", Q6 marcada como removida com o motivo | `2ad9f3f` |
| 8 | **Pós-aprovação (16:07):** texto do selo neutro, "Conversa de <titular>"; teste de o gestor virar titular | **Acatado.** Texto neutro em RF-2/CA-5; **CA-9 novo** (`claim`/`transfer` → selo some e `mark-read` zera para o gestor) | `2ad9f3f` |
| 9 | **Pós-aprovação (16:07):** Q5 continua fora; escrever em `02-design.md` §1.4 que o gestor responde e zera o contador do titular | **Acatado.** Parágrafo "Limitação conhecida (Q5)" na §1.4, com a transferência | este push (ver `git log`) |
| 4 | Medir `assignee_kind` e tipo de ator antes de aprovar | **Acatado e medido** (`02-design.md` §1.6): IA tem dono nulo pelo CHECK; handler recusa ator não-usuário. T0(b)/(e) fechadas | `2363cc1` |
| 5 | Volume do audit sem dedupe | **Acatado.** 1 linha por (org, conversa, ator) a cada 30 min, falha aberta | `b12cf76` |
| 6 | Como a suíte `invariants` chama a rota | **Acatado.** Ela não chama; CA-1 passa a ser e2e de API pela rota + invariante só do predicado SQL | `2363cc1` |

**Registro das decisões na #70:** feito pelo Sciuba; os três links estão no topo deste arquivo.
Eu não postei nada na #70.

## Aprovação
- [x] Q1–Q7 decididas (Q6 removida; Q7 revista duas vezes) — links no topo
- [x] Revisor aprovou a spec: Sciuba, 2026-11-23 16:01 (`APPROVED`). **A aprovação vale para o restante
  da spec**; os ajustes pós-aprovação (linhas 7 a 9 acima) aguardam a **reconferência só dessas linhas**
  pelo Sciuba, como ele pediu.
