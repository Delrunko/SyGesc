-- =====================================================================
-- 04_chatbot.sql : contrôle admin du chatbot (réglages, quotas, lexique, signalements)
-- À exécuter UNE FOIS, après 01 et 02.
-- =====================================================================

-- ---------- 1. Réglages globaux (une seule ligne) ----------
create table if not exists public.chatbot_reglages (
  id boolean primary key default true check (id),
  actif boolean not null default true,
  quota_defaut integer not null default 50 check (quota_defaut between 0 and 1000),
  maj_le timestamptz not null default now()
);
insert into public.chatbot_reglages default values on conflict do nothing;

-- ---------- 2. Réglages par enseignant (modifiables uniquement par l'admin) ----------
alter table public.enseignants
  add column if not exists chatbot_actif boolean not null default true,
  add column if not exists chatbot_quota integer
    check (chatbot_quota is null or chatbot_quota between 0 and 1000);

-- ---------- 3. Lexique de synonymes (géré par l'admin) ----------
create table if not exists public.chatbot_lexique (
  id uuid primary key default gen_random_uuid(),
  intention text not null check (intention ~ '^[a-z_]{2,40}$'),
  mot text not null check (char_length(mot) between 2 and 60),
  created_at timestamptz not null default now(),
  unique (intention, mot)
);

-- ---------- 4. Phrases signalées par les enseignants (volontairement) ----------
create table if not exists public.chatbot_signalements (
  id uuid primary key default gen_random_uuid(),
  enseignant_id uuid not null references public.enseignants(id) on delete cascade,
  texte text not null check (char_length(texte) between 3 and 200),
  cree_le timestamptz not null default now()
);
create index if not exists chatbot_signalements_enseignant_idx
  on public.chatbot_signalements (enseignant_id, cree_le desc);

-- ---------- 5. RLS ----------
alter table public.chatbot_reglages enable row level security;
alter table public.chatbot_lexique enable row level security;
alter table public.chatbot_signalements enable row level security;

create policy chatbot_reglages_lecture on public.chatbot_reglages
  for select to authenticated using (public.est_admin());

create policy chatbot_lexique_lecture on public.chatbot_lexique
  for select to authenticated using (public.compte_valide() or public.est_admin());

create policy chatbot_signalements_lecture on public.chatbot_signalements
  for select to authenticated using (public.est_admin());

revoke all on public.chatbot_reglages, public.chatbot_lexique, public.chatbot_signalements
  from anon, authenticated;
grant select on public.chatbot_reglages, public.chatbot_lexique, public.chatbot_signalements
  to authenticated;

-- ---------- 6. Fonctions pour l'enseignant ----------
create or replace function public.chatbot_statut() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.chatbot_reglages;
  e public.enseignants;
  q integer;
  n integer;
begin
  select * into r from public.chatbot_reglages limit 1;
  select * into e from public.enseignants where id = (select auth.uid());
  if e.id is null or e.statut <> 'valide' then
    return jsonb_build_object('etat', 'compte_non_valide');
  end if;
  q := coalesce(e.chatbot_quota, r.quota_defaut);
  select u.nb_messages into n from public.usage_chatbot u
    where u.enseignant_id = e.id and u.jour = current_date;
  n := coalesce(n, 0);
  return jsonb_build_object(
    'etat', case
      when not r.actif then 'desactive_global'
      when not e.chatbot_actif then 'desactive_compte'
      when n >= q then 'quota_atteint'
      else 'ok' end,
    'quota', q,
    'utilises', n
  );
end $$;

-- Compte un message (à appeler avant de traiter une phrase) ; refuse si non autorisé
create or replace function public.chatbot_compter_message() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s jsonb;
  uid uuid := (select auth.uid());
begin
  s := public.chatbot_statut();
  if s->>'etat' <> 'ok' then
    return s;
  end if;
  insert into public.usage_chatbot as u (enseignant_id, jour, nb_messages)
  values (uid, current_date, 1)
  on conflict (enseignant_id, jour) do update set nb_messages = u.nb_messages + 1;
  return jsonb_set(s, '{utilises}', to_jsonb((s->>'utilises')::integer + 1));
end $$;

-- Signaler une phrase non comprise (action volontaire de l'enseignant)
create or replace function public.signaler_phrase(p_texte text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t text;
  n integer;
begin
  if not public.compte_valide() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  t := left(trim(coalesce(p_texte, '')), 200);
  if char_length(t) < 3 then
    raise exception 'Phrase trop courte';
  end if;
  select count(*) into n from public.chatbot_signalements
    where enseignant_id = uid and cree_le > now() - interval '1 day';
  if n >= 20 then
    raise exception 'Limite de signalements atteinte pour aujourd’hui';
  end if;
  insert into public.chatbot_signalements (enseignant_id, texte) values (uid, t);
end $$;

-- ---------- 7. Fonctions réservées à l'admin ----------
create or replace function public.admin_chatbot_reglages_maj(p_actif boolean, p_quota_defaut integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_quota_defaut is null or p_quota_defaut < 0 or p_quota_defaut > 1000 then
    raise exception 'Quota invalide (0 à 1000)';
  end if;
  update public.chatbot_reglages
    set actif = p_actif, quota_defaut = p_quota_defaut, maj_le = now()
    where id;
end $$;

create or replace function public.admin_chatbot_compte_maj(p_id uuid, p_actif boolean, p_quota integer)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_quota is not null and (p_quota < 0 or p_quota > 1000) then
    raise exception 'Quota invalide (0 à 1000)';
  end if;
  update public.enseignants
    set chatbot_actif = p_actif, chatbot_quota = p_quota
    where id = p_id;
end $$;

-- Usage par enseignant : uniquement des compteurs, jamais le contenu des messages
create or replace function public.admin_chatbot_usage(p_jours integer default 7)
returns table (enseignant_id uuid, nom text, messages bigint, aujourdhui integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
  select e.id,
         e.nom,
         coalesce(sum(u.nb_messages) filter (where u.jour > current_date - p_jours), 0)::bigint,
         coalesce(max(u.nb_messages) filter (where u.jour = current_date), 0)::integer
  from public.enseignants e
  left join public.usage_chatbot u on u.enseignant_id = e.id
  group by e.id, e.nom
  order by 3 desc, 2;
end $$;

create or replace function public.admin_lexique_ajouter(p_intention text, p_mot text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  insert into public.chatbot_lexique (intention, mot)
  values (lower(trim(p_intention)), lower(trim(p_mot)))
  on conflict do nothing;
end $$;

create or replace function public.admin_lexique_supprimer(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  delete from public.chatbot_lexique where id = p_id;
end $$;

create or replace function public.admin_signalement_supprimer(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  delete from public.chatbot_signalements where id = p_id;
end $$;

-- ---------- 8. Droits d'exécution (rien d'ouvert par défaut) ----------
revoke execute on function
  public.chatbot_statut(),
  public.chatbot_compter_message(),
  public.signaler_phrase(text),
  public.admin_chatbot_reglages_maj(boolean, integer),
  public.admin_chatbot_compte_maj(uuid, boolean, integer),
  public.admin_chatbot_usage(integer),
  public.admin_lexique_ajouter(text, text),
  public.admin_lexique_supprimer(uuid),
  public.admin_signalement_supprimer(uuid)
from public, anon;

grant execute on function
  public.chatbot_statut(),
  public.chatbot_compter_message(),
  public.signaler_phrase(text),
  public.admin_chatbot_reglages_maj(boolean, integer),
  public.admin_chatbot_compte_maj(uuid, boolean, integer),
  public.admin_chatbot_usage(integer),
  public.admin_lexique_ajouter(text, text),
  public.admin_lexique_supprimer(uuid),
  public.admin_signalement_supprimer(uuid)
to authenticated;