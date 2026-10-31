# Instruções para o Claude neste repositório

- App interno do restaurante Flamboyant. Responsáveis: Gabriel (dono do repositório) e Ricardo (gerente do hotel).
- Usuários finais: Yetsy (pedido de produção e compras), Leonardo (produção), Daniel (requisições), Jéssica (compras).
- Responda e escreva textos do app em português do Brasil, linguagem simples de cozinha.
- `public/index.html` é o app original do artefato. `public/js/runtime.js` recria `claude.use("db" | "downloads" | "sample")`
  sobre Supabase e a função `netlify/functions/ler-requisicao.mjs`. Prefira manter essa API ao mudar o app.
- Regras de negócio validadas (não mudar sem pedido explícito): meta = média diária de saída da câmara fria × 10 dias,
  gatilho urgente < 5 dias, período da média 15 dias, validade padrão 90 dias com exceções do JSON `estoques`,
  itens de compra = Massa de Pizza, Parmesão e todos os pães.
- Nunca faça commit direto na `main`: crie branch e abra pull request. Nunca coloque chaves secretas no código.
- Antes de propor um PR, teste no navegador (há um teste com Supabase simulado descrito no histórico do PR #1).
