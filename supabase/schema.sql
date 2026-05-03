-- ============================================================
-- LIFE OS — Supabase schema
-- Rode este arquivo inteiro no SQL Editor do seu projeto.
-- Cobre: tabelas, índices, RLS por usuário, trigger de criação
-- de preferências e trigger de updated_at.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- USER PREFERENCES (singletons por usuário)
-- ------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  reserve      numeric(14,2) not null default 0,
  reserve_goal numeric(14,2) not null default 0,
  family_goal  numeric(8,2)  not null default 0,
  workout_goal integer       not null default 0,
  updated_at   timestamptz   not null default now()
);

-- ------------------------------------------------------------
-- TRANSACTIONS
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('income','expense')),
  amount      numeric(14,2) not null check (amount >= 0),
  description text not null check (length(description) > 0),
  category    text not null default '',
  occurred_on date not null,
  created_at  timestamptz not null default now()
);
create index if not exists transactions_user_date_idx
  on public.transactions(user_id, occurred_on desc);

-- ------------------------------------------------------------
-- CARDS (cartões de crédito)
-- ------------------------------------------------------------
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (length(name) > 0),
  flag         text not null check (flag in ('VISA','MASTER','ELO','AMEX','HIPER')),
  due_day      smallint not null check (due_day between 1 and 31),
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  used         numeric(14,2) not null default 0 check (used >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists cards_user_idx on public.cards(user_id);

-- ------------------------------------------------------------
-- INVESTMENTS
-- ------------------------------------------------------------
create table if not exists public.investments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(name) > 0),
  type       text not null check (type in ('fixed','variable','other')),
  amount     numeric(14,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);
create index if not exists investments_user_idx on public.investments(user_id);

-- ------------------------------------------------------------
-- GOALS
-- ------------------------------------------------------------
create table if not exists public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text not null check (length(title) > 0),
  category      text not null check (category in ('financeira','profissional','pessoal','compra')),
  deadline      date,
  target        numeric(14,2) not null default 0 check (target >= 0),
  current_value numeric(14,2) not null default 0 check (current_value >= 0),
  description   text,
  created_at    timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals(user_id);

-- ------------------------------------------------------------
-- HABITS + LOGS
-- ------------------------------------------------------------
create table if not exists public.habits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (length(name) > 0),
  created_at timestamptz not null default now()
);
create index if not exists habits_user_idx on public.habits(user_id);

create table if not exists public.habit_logs (
  habit_id   uuid not null references public.habits(id) on delete cascade,
  log_date   date not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (habit_id, log_date)
);
create index if not exists habit_logs_user_date_idx
  on public.habit_logs(user_id, log_date desc);

-- ------------------------------------------------------------
-- FAMILY TIME
-- ------------------------------------------------------------
create table if not exists public.family_time (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  occurred_on date not null,
  hours       numeric(5,2) not null check (hours > 0),
  activity    text not null check (length(activity) > 0),
  created_at  timestamptz not null default now()
);
create index if not exists family_time_user_date_idx
  on public.family_time(user_id, occurred_on desc);

-- ------------------------------------------------------------
-- STUDY ITEMS + SESSIONS
-- ------------------------------------------------------------
create table if not exists public.study_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (length(title) > 0),
  type        text not null check (type in ('curso','livro','certificacao','outro')),
  status      text not null check (status in ('andamento','planejado','concluido')),
  progress    smallint not null default 0 check (progress between 0 and 100),
  total_hours numeric(6,1) not null default 0 check (total_hours >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists study_items_user_idx on public.study_items(user_id);

create table if not exists public.study_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     uuid not null references public.study_items(id) on delete cascade,
  hours       numeric(5,2) not null check (hours > 0),
  occurred_on date not null,
  created_at  timestamptz not null default now()
);
create index if not exists study_sessions_user_date_idx
  on public.study_sessions(user_id, occurred_on desc);

-- ------------------------------------------------------------
-- WORKOUTS
-- ------------------------------------------------------------
create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  occurred_on  date not null,
  type         text not null,
  duration_min integer not null check (duration_min >= 0),
  intensity    smallint not null check (intensity between 1 and 5),
  created_at   timestamptz not null default now()
);
create index if not exists workouts_user_date_idx
  on public.workouts(user_id, occurred_on desc);

-- ------------------------------------------------------------
-- TRIPS / PLANS (viagens, compras, eventos)
-- ------------------------------------------------------------
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (length(title) > 0),
  type        text not null check (type in ('viagem','compra','evento')),
  target_date date,
  cost        numeric(14,2) not null default 0 check (cost >= 0),
  saved       numeric(14,2) not null default 0 check (saved >= 0),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists trips_user_date_idx
  on public.trips(user_id, target_date);

-- ------------------------------------------------------------
-- DAILY METRICS (energia + foco — 1 linha por dia)
-- ------------------------------------------------------------
create table if not exists public.daily_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  date    date not null,
  energy  smallint check (energy between 1 and 5),
  focus   smallint check (focus between 1 and 5),
  primary key (user_id, date)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.user_preferences enable row level security;
alter table public.transactions     enable row level security;
alter table public.cards            enable row level security;
alter table public.investments      enable row level security;
alter table public.goals            enable row level security;
alter table public.habits           enable row level security;
alter table public.habit_logs       enable row level security;
alter table public.family_time      enable row level security;
alter table public.study_items      enable row level security;
alter table public.study_sessions   enable row level security;
alter table public.workouts         enable row level security;
alter table public.trips            enable row level security;
alter table public.daily_metrics    enable row level security;

-- helper: cria as 4 policies CRUD pra cada tabela
do $$
declare
  t text;
  tables text[] := array[
    'user_preferences','transactions','cards','investments','goals',
    'habits','habit_logs','family_time','study_items','study_sessions',
    'workouts','trips','daily_metrics'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists owner_select on public.%I;', t);
    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format('drop policy if exists owner_update on public.%I;', t);
    execute format('drop policy if exists owner_delete on public.%I;', t);

    execute format(
      'create policy owner_select on public.%I for select using (auth.uid() = user_id);', t);
    execute format(
      'create policy owner_insert on public.%I for insert with check (auth.uid() = user_id);', t);
    execute format(
      'create policy owner_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format(
      'create policy owner_delete on public.%I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at em user_preferences
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists user_preferences_touch on public.user_preferences;
create trigger user_preferences_touch
  before update on public.user_preferences
  for each row execute function public.touch_updated_at();

-- cria a linha de preferences automaticamente quando um usuário novo é criado
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_preferences (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- garantir que usuários já existentes (caso você tenha criado antes do trigger)
-- também tenham linha em user_preferences:
insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;
