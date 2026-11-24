# 02 — Design

**Verificado em:** `<SHA>` · **Comando:** `git rev-parse --short HEAD`

## 1. O que existe hoje (verificado)
| Peça | Onde | Observação |
|---|---|---|
| <…> | `caminho/real.ts` | <o que faz, o que NÃO faz> |

**NÃO VERIFICADO:** <afirmações que dependem de medição ainda não feita>

## 2. Decisão de design
<A abordagem escolhida, em prosa curta. Diagrama se ajudar.>

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| <…> | <…> |

## 3. Contratos
<Assinaturas de funções/hooks, shape de payloads, rotas (`/api/v1/…`), tipos Zod.>

## 4. Dados
<Tabelas/colunas novas ou "nenhuma mudança de schema". Se houver: migration `<ts>_<NNNN>_<slug>.sql` + apêndice no `baseline.sql` + linha no `MANIFEST.md`, RLS e função nova com `revoke` das duas origens.>

## 5. Rastreabilidade
| Requisito | Onde é atendido neste design |
|---|---|
| RF-1 | §<seção> |

## 6. Living System Checklist
(`docs/doctrine/sistema-vivo.md`) — cada resposta **nomeia o artefato concreto**.
- Entrada e saída: <…>
- Emite atividade/log: <…>
- Aparece na tela: <…>
- Porta na navegação (`lib/navigation/registry.ts`): <…>
- Mecanismo anti-morte: <…>
- Laço de retorno (o que muda no sistema quando ela erra): <…>
- Mapa vivo (`docs/architecture/`): <…>

## 7. Riscos
| Risco | Mitigação |
|---|---|
| <…> | <…> |
