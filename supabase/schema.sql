-- Flamboyant · Cozinha — estrutura do banco no Supabase
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo inteiro > Run.
-- Pode rodar de novo sem perder dados (tudo usa "if not exists" / "or replace").

-- 1) Perfis: nome e função de cada pessoa que faz login
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel text not null default 'equipe' check (papel in ('admin','equipe')),
  criado_em timestamptz not null default now()
);
alter table public.perfis enable row level security;

drop policy if exists "perfis: ler (logado)" on public.perfis;
create policy "perfis: ler (logado)" on public.perfis for select to authenticated using (true);

-- função auxiliar: o usuário logado é admin?
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin');
$$;

drop policy if exists "perfis: admin edita" on public.perfis;
create policy "perfis: admin edita" on public.perfis for all to authenticated
  using (public.eh_admin()) with check (public.eh_admin());

-- 2) Documentos do app (mesmo formato do banco do artefato)
--    coleções usadas hoje: plano, feitos, movs (requisições), compras
create table if not exists public.docs (
  colecao text not null,
  id text not null,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid(),
  primary key (colecao, id)
);
alter table public.docs enable row level security;
alter table public.docs replica identity full;  -- para o app receber exclusões em tempo real

create or replace function public.docs_carimbo() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists docs_carimbo on public.docs;
create trigger docs_carimbo before insert or update on public.docs
  for each row execute function public.docs_carimbo();

-- quem tem login (e perfil cadastrado) lê e grava; ninguém de fora acessa
drop policy if exists "docs: equipe lê" on public.docs;
create policy "docs: equipe lê" on public.docs for select to authenticated
  using (exists (select 1 from public.perfis where id = auth.uid()));
drop policy if exists "docs: equipe grava" on public.docs;
create policy "docs: equipe grava" on public.docs for insert to authenticated
  with check (exists (select 1 from public.perfis where id = auth.uid()));
drop policy if exists "docs: equipe altera" on public.docs;
create policy "docs: equipe altera" on public.docs for update to authenticated
  using (exists (select 1 from public.perfis where id = auth.uid()))
  with check (exists (select 1 from public.perfis where id = auth.uid()));
drop policy if exists "docs: equipe apaga" on public.docs;
create policy "docs: equipe apaga" on public.docs for delete to authenticated
  using (exists (select 1 from public.perfis where id = auth.uid()));

-- 3) Histórico: toda alteração fica registrada (quem, quando, antes e depois)
create table if not exists public.docs_historico (
  hid bigserial primary key,
  colecao text not null,
  id text not null,
  acao text not null,
  antes jsonb,
  depois jsonb,
  por uuid,
  em timestamptz not null default now()
);
alter table public.docs_historico enable row level security;
drop policy if exists "historico: admin lê" on public.docs_historico;
create policy "historico: admin lê" on public.docs_historico for select to authenticated using (public.eh_admin());

create or replace function public.docs_registra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.docs_historico (colecao, id, acao, antes, depois, por)
  values (coalesce(new.colecao, old.colecao), coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then old.dados end,
          case when tg_op <> 'DELETE' then new.dados end,
          auth.uid());
  return coalesce(new, old);
end $$;
drop trigger if exists docs_registra on public.docs;
create trigger docs_registra after insert or update or delete on public.docs
  for each row execute function public.docs_registra();

-- 4) Tempo real: o app atualiza sozinho quando alguém lança algo
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 5) Depois de criar cada usuário em Authentication > Users, cadastre o perfil, por exemplo:
-- insert into public.perfis (id, nome, papel)
--   select id, 'Gabriel', 'admin' from auth.users where email = 'SEU_EMAIL';
-- insert into public.perfis (id, nome, papel)
--   select id, 'Daniel', 'equipe' from auth.users where email = 'EMAIL_DO_DANIEL';
