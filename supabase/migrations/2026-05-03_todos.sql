-- ============================================================
-- Migration: tabela `todos` (lista de tarefas com rollover automático)
-- Rode esse arquivo no SQL Editor do Supabase, depois do schema.sql.
-- ============================================================

create table if not exists public.todos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null check (length(title) > 0),
  notes        text,
  due_date     date not null default current_date,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists todos_user_due_idx
  on public.todos(user_id, due_date);

create index if not exists todos_user_pending_idx
  on public.todos(user_id, due_date)
  where completed_at is null;

-- RLS
alter table public.todos enable row level security;

drop policy if exists owner_select on public.todos;
drop policy if exists owner_insert on public.todos;
drop policy if exists owner_update on public.todos;
drop policy if exists owner_delete on public.todos;

create policy owner_select on public.todos
  for select using (auth.uid() = user_id);
create policy owner_insert on public.todos
  for insert with check (auth.uid() = user_id);
create policy owner_update on public.todos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy owner_delete on public.todos
  for delete using (auth.uid() = user_id);
