# SDD — Specification-Driven Development

> Cada issue que muda comportamento ganha uma **pasta de especificação** antes de ganhar código.
> A spec é revisada e aprovada; só depois a implementação começa, e ela segue a spec.

Esta pasta **não substitui** `docs/specs/NN-spec-*.md` (contratos técnicos de domínio, que seguem
valendo). Ela guarda a spec **por issue**: o que aquela mudança específica promete, como será feita
e como será provada. Se o resultado alterar um contrato de domínio, a spec de domínio é atualizada
no mesmo PR da implementação.

---

## Estrutura

```
docs/specs/sdd/
├── README.md                    ← este arquivo (fluxo e regras)
├── _template/                   ← copie para começar uma issue nova
└── <issue>-<slug>/              ← uma pasta por issue
    ├── README.md                ← estado, links e checklist de aprovação
    ├── 01-requisitos.md         ← O QUÊ: problema, requisitos, aceite, fora de escopo
    ├── 02-design.md             ← COMO: decisões, contratos, dados, alternativas recusadas
    ├── 03-testes.md             ← PROVA: critério de aceite → teste/medição que o vigia
    ├── 04-tarefas.md            ← ORDEM: tarefas pequenas, na sequência de implementação
    └── 05-revisao.md            ← REGISTRO: comentários de review, decisões e aprovação
```

**Nome da pasta:** `<número da issue>-<slug-em-kebab-case>`, ex.: `55-notificacoes-agrupadas`.

---

## Ciclo de vida

| Estado | Significa | Quem muda |
|---|---|---|
| `rascunho` | Spec sendo escrita; ainda não pede revisão | autor |
| `em-revisao` | PR da spec aberto; revisores comentando | autor |
| `aprovada` | Review feito e aprovado; **implementação liberada** | revisor (registra em `05-revisao.md`) |
| `implementando` | PR de código aberto, citando esta spec | autor |
| `concluida` | Código mergeado; critérios de aceite provados | autor |
| `substituida` | Outra spec ocupou o lugar (apontar qual) | autor |

O estado vive no `README.md` da pasta, no campo **Estado**.

---

## Fluxo

1. **Abrir a spec.** Copie `_template/` para `<issue>-<slug>/`. Preencha `01-requisitos.md` a
   partir do corpo da issue, **sem inventar requisito**: cada item rastreia para um trecho da
   issue.
2. **Medir antes de desenhar.** Em `02-design.md`, toda afirmação sobre o código existente cita
   arquivo real, e a seção "Verificado em" registra o SHA. Afirmação sem verificação vai para
   "NÃO VERIFICADO".
3. **PR só da spec**, para a `develop`, com o rótulo `spec`. Nenhum código de produto neste PR.
4. **Review e aprovação.** Comentários e decisões entram em `05-revisao.md`. Estado vira
   `aprovada` só com aprovação registrada.
5. **Implementar seguindo `04-tarefas.md`.** O PR de código cita a spec. Se a implementação
   descobrir que a spec está errada, **pare, corrija a spec num commit próprio e siga** — spec e
   código não podem divergir em silêncio.
6. **Fechar.** Marque os critérios de `03-testes.md` com a evidência e mude o estado para
   `concluida`.

---

## Regras

- **Spec aprovada é contrato.** Mudança de escopo depois da aprovação é commit na spec, com
  entrada em `05-revisao.md`, antes de ser mudança no código.
- **Todo critério de aceite tem dono de prova** em `03-testes.md`: um teste automatizado, uma
  medição por ferramenta ou uma prova pela tela. Critério sem prova não conta.
- **Fora de escopo é explícito.** O que a issue exclui vai para `01-requisitos.md` como está.
- **Doutrina do repo vale integralmente** (`CLAUDE.md`): migration versionada + baseline +
  MANIFEST quando houver schema; QA Visual com recurso real quando houver UI; fragmento em
  `.changes/` quando houver efeito visível ao operador; Living System Checklist respondido.
- **Sem número que envelhece.** Prefira "rode este comando" a "hoje são N".
