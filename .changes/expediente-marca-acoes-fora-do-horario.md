---
impacto: capacidade_nova
secao: adicionado
titulo: Ações de administrador e gerente fora do expediente ficam marcadas na auditoria
---

Quando uma organização configura o expediente, administradores e gerentes
continuam livres para trabalhar a qualquer hora, mas agora a auditoria mostra
quando isso aconteceu fora do horário: a linha de auditoria da ação ganha a
marca `fora_do_expediente`. O mesmo vale para a equipe de suporte da plataforma
e para o administrador da plataforma. O atendente (`agent`) nunca recebe a marca,
porque fora do horário ele é barrado, e a marca não cria linhas novas nem mexe
no que o usuário vê.

Quem não configurou o expediente não vê nenhuma diferença. A marca vale na hora
para as mudanças feitas pela tela ou pela API de configuração do expediente; se
a instalação roda em mais de um processo, o outro enxerga a mudança em até 30
segundos.

Você não precisa fazer nada ao atualizar.
