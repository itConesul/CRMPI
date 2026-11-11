---
impacto: nada_mudou
secao: alterado
titulo: O convite leva a pessoa ao caminho certo, e sem organização não há /app
---

Quem abre o link do convite sem estar logado não escolhe mais entre "Fazer login" e "Ainda não
tenho conta": o sistema vê se o e-mail do convite já tem conta confirmada. Se tem, vai ao login
com o e-mail já preenchido e volta ao aceite; se não tem, vai ao cadastro com o e-mail travado.
O botão de aceitar continua, e o destino final é a Caixa de entrada. A confirmação de e-mail do
cadastro continua exigida. Quem está logado e não pertence a nenhuma organização deixa de ver um
`/app` vazio: com convite válido vai ao aceite, sem convite vai a `/get-started`. Há uma migration
nova (`fn_conta_existe_por_email`), aplicada pelo `update.sh`.
