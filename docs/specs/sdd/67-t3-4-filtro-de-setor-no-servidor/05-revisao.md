# 05 — Revisão e aprovação

## Perguntas em aberto (a spec **recomenda**; quem decide é o revisor e, onde marcado, o dono do produto)

| # | Pergunta | Recomendação desta spec | Por que importa |
|---|---|---|---|
| **Q-1** | O espelho da regra vive em **TypeScript** (com teste de paridade contra o SQL) ou numa **função SQL com usuário explícito** (`fn_..._for(p_user, …)`), chamada por `rpc` com `service_role`? | **TypeScript agora, com a paridade**, porque esta tarefa não tem schema (não é 🔒) e a regra pura testa sem banco. **Reavaliar na T4b**, que já reescreve a função SQL: acrescentar a variante com usuário explícito custa pouco ali e elimina a duplicação (a alternativa é mais DIRC). Se a matriz de paridade se mostrar cara de manter, adianta-se | Duplicar a regra tem fonte da verdade declarada (o SQL) e custo permanente de paridade. A variante SQL tem um *round trip* por decisão e uma migration |
| **Q-2** | A tarefa pede a lista de exceções "vazia e justificada". **Medido:** 57 arquivos com client admin e 44 com `pg` já cairiam, então a leitura literal é impossível. Aceita a lista **completa e justificada por categoria** (`sistema` e `plataforma` por glob, permanentes; `pessoa`, `mcp` e `indeterminado` por arquivo, com **teto** que só desce)? | **Sim.** É o que "só encolhe" pode significar na prática | Decide o formato da varredura, que é o mecanismo anti-morte da tarefa |
| **Q-3** | **Qual é a chave do interruptor de setor** em `organizations.settings`? A spec da #67 diz só "o valor vive em `organizations.settings`". O TypeScript lê o mesmo valor que a T4b vai pôr no SQL | `settings.department_isolation.enabled` (booleano, **ausente = desligado**), no padrão das chaves irmãs (`visibility_mode`, `routing`, `business_hours`, `branding`, `security`). **É proposta**, não decisão | Sem isso o espelho não tem o que ler, e T4b e T3.4 podem escolher nomes diferentes |
| **Q-4** | **Efeito visível ao operador, na T3.5 (não aqui):** hoje as rotas admin que servem pessoa devolvem **tudo da organização** a um `agent`, mesmo em `visibility_mode = own`, porque o client admin ignora a regra. Aplicar a função **corrige** isso e um `agent` em `own` passa a ver menos nessas rotas. É a correção pretendida? | **Sim**, e a T3.5 declara o efeito num fragmento de `.changes/`. **Dono do produto** | É mudança de comportamento para quem hoje depende do vazamento sem saber |
| **Q-5** | O **push** de `message.received` (pergunta P-A da T3.2) vai a todo assinante da organização. Esta spec entrega a decisão **por destinatário, em lote** (`carregarAtores` + `podeVerConversa`), mas **não a aplica**. Confirma que aplicar é decisão do dono, em tarefa própria? | **Sim.** A T3.4 só dá o primitivo | Evita que um PR de "função compartilhada" mude o que as pessoas recebem no celular |
| **Q-6** | O `viewer` por **sessão de suporte de leitura** (papel efetivo `viewer`) segue a regra de setor do `viewer` quando o interruptor está ligado? | **Sim**, por ser o papel efetivo (`lib/auth/require-role.ts:62-111`). Hoje é assumido, **não verificado** | Decide se o suporte de leitura enxerga o setor alheio |
| **Q-7** | Esta tarefa **não tem issue própria**: é a T3.4 da #67. A pasta se chama `67-t3-4-filtro-de-setor-no-servidor`. Abre-se uma issue para rastrear, ou fica sob a #67? | **Fica sob a #67**, como as outras tarefas T3.x. Abre issue se o revisor preferir | O `README.md` do SDD manda `<issue>-<slug>/`; há dois diretórios com prefixo `67-` |

## Decisões
Nenhuma ainda. Cada resposta entra aqui, com o link do comentário de onde veio.

| Data | Pergunta | Decisão | Efeito no design | Confirmado por |
|---|---|---|---|---|
| — | — | — | — | — |

## Comentários de review
(nenhum ainda)

## Aprovação
- [ ] **Spec aprovada por:** (revisor), em (data) — implementação liberada, em PR novo para a `develop`, seguindo `04-tarefas.md`
- [ ] **Q-1 a Q-7** respondidas e registradas acima
