---
impacto: nada_mudou
secao: corrigido
titulo: A mesma mensagem não sai duas vezes para o cliente
---

O envio de mensagem pela tela podia chegar duplicado no WhatsApp do cliente. Agora a rota
reconhece o reenvio automático do navegador (mesmo `Idempotency-Key`) e o duplo-envio do
atendente (Enter duas vezes ou duplo clique com o mesmo texto): a segunda tentativa devolve
a mensagem já enviada, sem mandar outra. A janela do duplo-envio é de 15 segundos, por
usuário, conversa e texto; passado esse prazo o mesmo texto sai normalmente. Envio que falha
não bloqueia o reenvio. Se o Redis estiver fora do ar, o envio segue sem essa proteção.
