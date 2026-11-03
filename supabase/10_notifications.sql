-- Notifications privées pour les nouvelles inscriptions et validations de comptes.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('nouvelle_inscription', 'compte_valide')),
  titre text not null check (char_length(titre) between 1 and 120),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_lecture_personnelle on public.notifications;
create policy notifications_lecture_personnelle on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists notifications_marquer_lue on public.notifications;
create policy notifications_marquer_lue on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.notifier_nouvelle_inscription()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, titre, message)
  select a.id, 'nouvelle_inscription', 'Nouvelle inscription',
         'Une demande de compte enseignant a été créée : ' || new.nom || '.'
  from public.admins a;
  return new;
end
$$;

drop trigger if exists notifier_inscription_enseignant on public.enseignants;
create trigger notifier_inscription_enseignant
after insert on public.enseignants
for each row execute function public.notifier_nouvelle_inscription();

create or replace function public.notifier_validation_enseignant()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.statut is distinct from new.statut and new.statut = 'valide' then
    insert into public.notifications (user_id, type, titre, message)
    values (
      new.id,
      'compte_valide',
      'Compte validé',
      'Ton compte enseignant a été validé. Tu peux maintenant accéder à ton espace.'
    );
  end if;
  return new;
end
$$;

drop trigger if exists notifier_validation_enseignant on public.enseignants;
create trigger notifier_validation_enseignant
after update of statut on public.enseignants
for each row execute function public.notifier_validation_enseignant();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'enseignants'
     ) then
    alter publication supabase_realtime add table public.enseignants;
  end if;
end
$$;
