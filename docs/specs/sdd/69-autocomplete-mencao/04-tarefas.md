# 04 — Tarefas

Pequenas, na ordem em que serão implementadas; cada uma deixa o repo verde. Só começa depois que
o estado do `README.md` for `aprovada`. Em cada uma: teste primeiro, vermelho provado pelo motivo
certo, depois o código mínimo.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T1 | `tokenDeMencao(membro, todos)` e `rotuloDoMembro(membro)` em `lib/notifications/mentions.ts` — teste primeiro, com o conjunto do CA-6 **incluindo "Ana" de uma palavra** e a asserção do e-mail vazio; o helper avalia com `mencaoAtingeUsuario` e e-mail marcador (as duas funções existentes não mudam) | RF-4, RF-7 | CA-6, CA-12 | [ ] |
| T2 | `resolverMencao(texto, cursor)` puro + troca de `[inicio, fim)` por token + espaço | RF-1, RF-3 | CA-3, CA-5 | [ ] |
| T3 | `MentionMenu` (`listbox`, filtro pelo rótulo, teclado **novo** — o `TemplateMenu` é só de mouse; posição e gatilho seguem o `TemplateMenu`); item sem nome com rótulo `Membro sem nome · <8 do id>`; estado "Nenhum membro encontrado"; textos novos com `useT` e entrada em `lib/i18n/dicionario.ts` | RF-2, RF-7, RNF-1, RNF-3 | CA-4, CA-7, CA-11, CA-12, CA-13 | [ ] |
| T4 | Integrar no `Composer.tsx`: abre só em modo nota, `useAssignableMembers(mode === "note")`, Enter/Esc cooperam com o menu (Enter sem resultado não envia e não insere; Esc/espaço fecham), estado de erro/vazio | RF-1, RF-3, RF-5, RNF-1 | CA-1, CA-3, CA-5, CA-7, CA-13 | [ ] |
| T5 | Asserção do `href` de `user.mentioned` em `push.handler.test.ts` (**só teste**; sem mudar o handler). **Se a asserção falhar:** não corrigir o handler neste PR; registrar a saída vermelha numa issue própria, deixar CA-10 e RF-6 declarados **não atendidos** no PR de código e devolver a decisão ao dono do produto | RF-6 | CA-10 | [ ] |
| T6 | E2E pela tela, dois usuários; evidência em `.superpowers/evidence/`; entrada em `docs/testing/user-journey-map.md` | RF-5, RF-6 | CA-1, CA-2 | [ ] |
| T7 | Fragmento em `.changes/` (`capacidade_nova`); conferir `docs/architecture/`; medições CA-8 e CA-9 | RF-5, RNF-2 | CA-8, CA-9 | [ ] |

## Aprovações que a implementação vai exigir (listadas de uma vez)
- 🔐 Abrir o PR de código (base `develop`).
- 🔐 `pnpm install` no worktree de implementação (não existe `node_modules` lá).
- 🔐 T6: o e2e sobe Supabase local e servidor de produção; pede aprovação própria.
