-- ============================================================
-- Migration: pagamentos recorrentes mensais
-- Modelo: 1 tabela de templates (recurring_payments) + 1 tabela
-- de logs de pagamento por mês (recurring_payment_logs).
-- O status "pendente do mês" é derivado no cliente: existe template
-- ativo? tem log pra esse YYYY-MM? não → pendente.
-- ============================================================

create table if not exists public.recurring_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (length(name) > 0),
  amount      numeric(14,2) not null default 0 check (amount >= 0),
  due_day     smallint not null check (due_day between 1 and 31),
  category    text not null default '',
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists recurring_payments_user_idx
  on public.recurring_payments(user_id, active);

create table if not exists public.recurring_payment_logs (
  recurring_id uuid not null references public.recurring_payments(id) on delete cascade,
  period       text not null check (period ~ '^\d{4}-\d{2}$'),
  paid_at      timestamptz not null default now(),
  amount_paid  numeric(14,2),
  user_id      uuid not null references auth.users(id) on delete cascade,
  primary key (recurring_id, period)
);

create index if not exists recurring_payment_logs_user_period_idx
  on public.recurring_payment_logs(user_id, period);

-- RLS
alter table public.recurring_payments      enable row level security;
alter table public.recurring_payment_logs  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['recurring_payments', 'recurring_payment_logs'] loop
    execute format('drop policy if exists owner_select on public.%I;', t);
    execute format('drop policy if exists owner_insert on public.%I;', t);
    execute format('drop policy if exists owner_update on public.%I;', t);
    execute format('drop policy if exists owner_delete on public.%I;', t);

    execute format('create policy owner_select on public.%I for select using (auth.uid() = user_id);', t);
    execute format('create policy owner_insert on public.%I for insert with check (auth.uid() = user_id);', t);
    execute format('create policy owner_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('create policy owner_delete on public.%I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;
