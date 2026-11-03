-- =====================================================================
-- 01_schema.sql : tables, contraintes, déclencheurs d'intégrité
-- À exécuter AVANT 02_securite.sql (SQL Editor de Supabase)
-- =====================================================================

create type public.statut_compte as enum ('en_attente', 'valide', 'refuse');
create type public.statut_presence as enum ('present', 'absent', 'excuse');

-- ---------- Comptes ----------
create table public.enseignants (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 150),
  telephone text check (telephone is null or char_length(telephone) <= 30),
  statut public.statut_compte not null default 'en_attente',
  created_at timestamptz not null default now()
);

create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade
);

-- ---------- Structure (créée par l'enseignant) ----------
create table public.etablissements (
  id uuid primary key default gen_random_uuid(),
  enseignant_id uuid not null default auth.uid() references public.enseignants(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 150),
  adresse text check (adresse is null or char_length(adresse) <= 300),
  telephone text check (telephone is null or char_length(telephone) <= 30),
  email text check (email is null or char_length(email) <= 254),
  site_web text check (site_web is null or char_length(site_web) <= 255),
  logo_path text check (logo_path is null or char_length(logo_path) <= 300),
  created_at timestamptz not null default now(),
  unique (enseignant_id, nom)
);

create table public.campus (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 150),
  ville text check (ville is null or char_length(ville) <= 100),
  created_at timestamptz not null default now(),
  unique (etablissement_id, nom)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campus(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 150),
  annee_scolaire text not null check (annee_scolaire ~ '^[0-9]{4}-[0-9]{4}$'),
  -- colonnes choisies par l'enseignant pour ses élèves (ex: ["date_naissance","sexe"])
  colonnes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(colonnes) = 'array' and octet_length(colonnes::text) <= 4000),
  created_at timestamptz not null default now(),
  unique (campus_id, nom, annee_scolaire)
);

create table public.periodes (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 100),
  date_debut date not null,
  date_fin date not null,
  check (date_fin >= date_debut),
  unique (classe_id, nom)
);

create table public.matieres (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 100),
  coefficient numeric(4,2) not null default 1 check (coefficient > 0),
  unique (classe_id, nom)
);

create table public.eleves (
  id uuid primary key default gen_random_uuid(),
  classe_id uuid not null references public.classes(id) on delete cascade,
  matricule text not null check (char_length(matricule) between 1 and 50),
  nom text not null check (char_length(nom) between 1 and 150),
  infos jsonb not null default '{}'::jsonb
    check (jsonb_typeof(infos) = 'object' and octet_length(infos::text) <= 8000),
  created_at timestamptz not null default now(),
  unique (classe_id, matricule)
);

-- ---------- Présences ----------
create table public.seances (
  id uuid primary key default gen_random_uuid(),
  matiere_id uuid not null references public.matieres(id) on delete cascade,
  date date not null,
  creneau smallint not null default 1 check (creneau between 1 and 20),
  unique (matiere_id, date, creneau)
);

create table public.presences (
  id uuid primary key default gen_random_uuid(),
  seance_id uuid not null references public.seances(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  statut public.statut_presence not null default 'present',
  unique (seance_id, eleve_id)
);

-- ---------- Notes ----------
create table public.evaluations (
  id uuid primary key default gen_random_uuid(),
  matiere_id uuid not null references public.matieres(id) on delete cascade,
  titre text not null check (char_length(titre) between 1 and 150),
  coefficient numeric(4,2) not null default 1 check (coefficient > 0),
  note_max numeric(5,2) not null default 20 check (note_max > 0),
  date date not null
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  eleve_id uuid not null references public.eleves(id) on delete cascade,
  valeur numeric(5,2) not null check (valeur >= 0),
  unique (evaluation_id, eleve_id)
);

-- ---------- Fiches (logo + rubriques), une configuration par établissement ----------
create table public.modeles_fiche (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null unique references public.etablissements(id) on delete cascade,
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 10000)
);

-- ---------- Chatbot : journal des actions et quotas (écrits par la fonction serveur) ----------
create table public.journal_actions (
  id uuid primary key default gen_random_uuid(),
  enseignant_id uuid not null references public.enseignants(id) on delete cascade,
  source text not null default 'chatbot' check (source in ('chatbot', 'app')),
  action text not null check (char_length(action) <= 100),
  details jsonb not null default '{}'::jsonb,
  annule boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.usage_chatbot (
  enseignant_id uuid not null references public.enseignants(id) on delete cascade,
  jour date not null default current_date,
  nb_messages integer not null default 0 check (nb_messages >= 0),
  primary key (enseignant_id, jour)
);

-- ---------- Index (les contraintes unique couvrent déjà les autres clés) ----------
create index on public.evaluations (matiere_id);
create index on public.presences (eleve_id);
create index on public.notes (eleve_id);
create index on public.journal_actions (enseignant_id, created_at desc);

-- ---------- Intégrité : présence ----------
create or replace function public.verifier_presence() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.seances s
    join public.matieres m on m.id = s.matiere_id
    join public.eleves e on e.classe_id = m.classe_id
    where s.id = new.seance_id and e.id = new.eleve_id
  ) then
    raise exception 'Élève et séance n''appartiennent pas à la même classe';
  end if;
  return new;
end $$;

create trigger trg_verifier_presence
before insert or update on public.presences
for each row execute function public.verifier_presence();

-- ---------- Intégrité : note (même classe + dans le barème) ----------
create or replace function public.verifier_note() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_max numeric;
begin
  select ev.note_max into v_max
  from public.evaluations ev
  join public.matieres m on m.id = ev.matiere_id
  join public.eleves e on e.classe_id = m.classe_id
  where ev.id = new.evaluation_id and e.id = new.eleve_id;

  if v_max is null then
    raise exception 'Élève et évaluation n''appartiennent pas à la même classe';
  end if;
  if new.valeur < 0 or new.valeur > v_max then
    raise exception 'Note hors barème (0 à %)', v_max;
  end if;
  return new;
end $$;

create trigger trg_verifier_note
before insert or update on public.notes
for each row execute function public.verifier_note();

-- ---------- Création automatique du profil à l'inscription ----------
-- Le statut est TOUJOURS 'en_attente' : impossible de s'inscrire déjà validé.
create or replace function public.creer_profil_enseignant() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.enseignants (id, nom, telephone)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'nom'), ''), split_part(new.email, '@', 1)), 150),
    left(nullif(trim(new.raw_user_meta_data->>'telephone'), ''), 30)
  );
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.creer_profil_enseignant();
