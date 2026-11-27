# 01 — Requisitos

## Problema
Da [#137](https://github.com/itConesul/CRMPI/issues/137), duas coisas na mesma tabela:

1. **Falha:** `conversation_notes` não está na publicação `supabase_realtime`. O aviso de menção na
   tela e a nota aparecendo ao vivo não recebem evento. Sem `VAPID_*` (opcional), esse é o único canal
   de aviso de menção. É o que deixa o CA-2 e o RF-6 da spec da #69 sem atender.
2. **Risco:** a leitura das notas só exige ser membro da organização; a de `messages` exige que a
   conversa seja visível. Um `agent` que não vê a conversa lê as notas dela.

Publicar sem corrigir o item 2 empurraria o texto das notas ao navegador de quem não deve vê-las.

## Requisitos

| ID | Requisito | Origem na issue |
|---|---|---|
| RF-1 | Só lê nota quem é `agent`+ **e** vê a conversa (e o admin de plataforma, como em `messages`) | "Proposta", passo 1; tabela de resultado |
| RF-2 | A política de escrita deixa de conceder leitura | "Apertar só `conversation_notes_select`" não basta; passo 2 |
| RF-3 | A nota nova chega ao vivo à conversa aberta e o aviso de menção chega a quem pode vê-la | "Falha"; passo 3 |
| RF-4 | Quem hoje cria e apaga nota pela tela continua conseguindo | "Escrita preservada" |
| RF-5 | Só cria, altera ou apaga nota quem vê a conversa (P2) | "Fora de escopo": "Pode entrar aqui ou numa issue própria" |
| RNF-1 | Migration versionada, apêndice **idempotente** no `baseline.sql` e linha no `MANIFEST.md` | "Entregáveis" |
| RNF-2 | A publicação só acontece depois de as políticas estarem apertadas | Passo 3: "Só depois de apertar" |

## Critérios de aceite
A issue lista entregáveis; os critérios abaixo derivam deles.

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | Agente que não vê a conversa e `viewer` não leem nota; dono da conversa e `manager` leem; outra organização não lê | RF-1, RF-2 |
| CA-2 | `conversation_notes` está na publicação, com RLS ligada | RF-3, RNF-2 |
| CA-3 | O dono insere com `RETURNING` (o que a rota faz) e apaga; `viewer` não insere | RF-4 |
| CA-4 | Agente que não vê a conversa não insere nela, com ou sem `RETURNING` | RF-5 |
| CA-5 | O mencionado com acesso recebe o aviso sem recarregar; o sem acesso não recebe; o gerente recebe | RF-3, RF-1 |
| CA-6 | `pnpm test:db` verde em install e update; reverter qualquer uma das políticas reprova o invariante | RNF-1 |

## Fora de escopo
- As outras cinco tabelas de `DIVIDA_CONHECIDA` (`channel_sessions`, `contacts`, `crm_pipelines`,
  `system_update_runs`, `system_version`).
- O push da menção para quem não vê a conversa: o evento `user.mentioned` leva um trecho da nota.
  Fica com a [#120](https://github.com/itConesul/CRMPI/issues/120) **(a issue o trata como decisão de produto)**.
- Setor (`department_id`): é a #67. A regra daqui consulta `conversations`, então herda o que a
  política daquela tabela passar a exigir **(acréscimo da spec)**.

## Perguntas (decididas em 2026-11-27, ver `05-revisao.md`: valeu a recomendação nas quatro)
| ID | Pergunta | Recomendação |
|---|---|---|
| P1 | O `viewer` deixa de ler notas por consulta direta. A tela já as esconde e a API já exige `agent`. Aceita? | **Sim.** É o que a rota promete |
| P2 | Exigir também ver a conversa para **criar, alterar e apagar** nota, como em `messages`? | **Sim, nesta issue.** Medido: o agente sem acesso grava nota na conversa alheia, e as notas entram no resumo que a IA lê na retomada (`lib/escalacao/continuidade.ts`) |
| P3 | O mencionado sem acesso à conversa deixa de ter qualquer aviso na tela (o push continua como está, na #120). Aceita? | **Sim.** O aviso levaria o texto de uma conversa que a pessoa não pode abrir |
| P4 | `impacto` do fragmento em `.changes/` | **`nada_mudou`, seção `corrigido`.** Nenhum botão some |
