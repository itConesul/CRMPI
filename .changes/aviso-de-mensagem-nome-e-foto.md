---
impacto: nada_mudou
secao: corrigido
titulo: O aviso de mensagem nova volta a mostrar o nome e a foto do contato
---

O aviso de mensagem nova lia o nome do contato direto do Supabase pelo navegador, que não
enxerga a sessão e recebia 401, e buscava a foto de um jeito que o navegador bloqueava por
CORS. O resultado era um aviso sempre genérico ("Nova mensagem"), sem foto, e erros no
console. Agora o nome vem pela API do próprio app e a foto é buscada sem credenciais.
