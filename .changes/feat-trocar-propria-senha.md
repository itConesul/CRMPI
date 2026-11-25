---
impacto: capacidade_nova
secao: adicionado
titulo: Quem já está logado pode trocar a própria senha, em Configurações › Segurança
---

Em Configurações › Segurança há agora uma seção "Senha": a pessoa informa a senha atual,
escolhe a nova e confirma. Antes, a única forma de trocar a senha era o link de "esqueci
minha senha" enviado por e-mail, e uma instalação sem o Resend configurado não tinha como
enviá-lo. A troca pela tela não depende de e-mail nenhum.

- A senha atual é conferida antes de aceitar a nova, e tentativas erradas em sequência são
  limitadas por conta.
- Ao concluir, os outros aparelhos em que a pessoa estava conectada são desconectados; o
  aparelho em uso continua logado.
- Quem tem a verificação em duas etapas ligada precisa ter informado o código ao entrar. Se
  a sessão não passou por ele, a tela pede que a pessoa entre de novo.
- Cada troca fica registrada no histórico de auditoria. Se o Resend estiver configurado, a
  pessoa também recebe um aviso por e-mail, com o caminho para quem não fez a troca.

Nada muda para quem não usa a tela. Você não precisa fazer nada ao atualizar.
