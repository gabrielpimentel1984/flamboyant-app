# Flamboyant · Cozinha

App de estoque, produção e requisições da cozinha do restaurante Flamboyant (Hotel Pousada do Bosque).
Nasceu como artefato do Claude e agora roda como app próprio, com login individual.

- **Hospedagem:** Netlify (publica sozinho a cada mudança aprovada na branch `main`)
- **Banco e login:** Supabase
- **Leitura da foto da requisição:** função do Netlify que chama a API do Claude

## Estrutura

```
public/                    o app (o que vai para o ar)
  index.html               telas, regras e dados (contagem, fichas técnicas, catálogo)
  js/config.js             URL e chave pública do Supabase
  js/runtime.js            login + banco (Supabase) + downloads + leitura da foto
netlify/functions/
  ler-requisicao.mjs       recebe a foto, confere o login e pede ao Claude para ler a folha
supabase/schema.sql        tabelas, regras de acesso e histórico de alterações
```

## Configuração (uma vez)

1. **Supabase**: criar o projeto (região São Paulo) → *SQL Editor* → colar `supabase/schema.sql` → *Run*.
2. **Supabase** → *Project Settings → API*: copiar a **Project URL** e a chave **anon public** para `public/js/config.js`.
3. **Supabase** → *Authentication → Providers → Email*: desligar "Allow new users to sign up" (só o admin cria contas).
4. **Supabase** → *Authentication → URL Configuration*: colocar o endereço do site do Netlify em *Site URL*.
5. **Netlify** → *Add new project → Import from GitHub* → escolher este repositório (as configurações vêm do `netlify.toml`).
6. **Netlify** → *Site configuration → Environment variables*:
   - `ANTHROPIC_API_KEY` = chave da API do Claude (console.anthropic.com) — **secreta**
   - `SUPABASE_URL` = a mesma URL do passo 2
   - `SUPABASE_ANON_KEY` = a mesma chave anon do passo 2
7. Em console.anthropic.com, definir um **limite mensal de gasto**.

## Criar o acesso de uma pessoa

A equipe entra com **usuário e senha** (sem e-mail). Por baixo, o usuário `daniel` vira `daniel@equipe.flamboyant.local`.

1. Supabase → *Authentication → Users → Add user → Create new user*:
   e-mail `daniel@equipe.flamboyant.local`, senha, e marcar **Auto Confirm User**.
2. Supabase → *SQL Editor*:
   ```sql
   insert into public.perfis (id, nome, papel, telas)
     select id, 'Daniel', 'equipe', array['req','est'] from auth.users where email = 'daniel@equipe.flamboyant.local';
   ```
   `papel`: `admin` (Gabriel, Ricardo) ou `equipe`. `telas` vazio = vê tudo.
   Códigos: `prod` pedido da Yetsy · `leo` produção do Leonardo · `cmp` compras · `req` requisição · `ab` abastecimento · `est` estoques.
3. Para trocar a senha de alguém da equipe: *Authentication → Users* → o usuário → *Reset password* não funciona sem e-mail;
   use *Update user* e defina a senha nova.

Quem tem login sem perfil cadastrado não vê nem grava nada.

## Como mudar o app

Nunca direto na `main`. Cada mudança vai numa branch e num *pull request*:
o Netlify gera um link de teste; o outro responsável confere no celular e aprova.
Ao juntar na `main`, o app oficial atualiza em cerca de 1 minuto.

## Segurança

- A chave `service_role` do Supabase e a `ANTHROPIC_API_KEY` **nunca** entram no código nem no chat.
- Toda alteração no banco fica registrada em `docs_historico` (quem, quando, antes e depois).
