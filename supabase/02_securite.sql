-- =====================================================================
-- 02_securite.sql : RLS, droits, stockage des logos
-- Principe : tout est interdit par défaut, on autorise le strict nécessaire.
-- À exécuter APRÈS 01_schema.sql
-- =====================================================================

-- ---------- 1. Fonctions utilitaires (SECURITY DEFINER, search_path vide) ----------
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where id = (select auth.uid())) $$;

create or replace function public.compte_valide() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enseignants
    where id = (select auth.uid()) and statut = 'valide'
  )
$$;

create or replace function public.possede_etablissement(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.compte_valide() and exists (
    select 1 from public.etablissements e
    where e.id = p_id and e.enseignant_id = (select auth.uid())
  )
$$;

create or replace function public.possede_campus(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.campus c
    where c.id = p_id and public.possede_etablissement(c.etablissement_id)
  )
$$;

create or replace function public.possede_classe(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_id and public.possede_campus(c.campus_id)
  )
$$;

create or replace function public.possede_matiere(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.matieres m
    where m.id = p_id and public.possede_classe(m.classe_id)
  )
$$;

create or replace function public.possede_seance(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.seances s
    where s.id = p_id and public.possede_matiere(s.matiere_id)
  )
$$;

create or replace function public.possede_evaluation(p_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.evaluations ev
    where ev.id = p_id and public.possede_matiere(ev.matiere_id)
  )
$$;

-- Seul moyen de valider / refuser un compte : réservé aux admins
create or replace function public.changer_statut_enseignant(p_id uuid, p_statut public.statut_compte)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update public.enseignants set statut = p_statut where id = p_id;
end $$;

-- ---------- 2. Activer la RLS sur TOUTES les tables ----------
alter table public.enseignants     enable row level security;
alter table public.admins          enable row level security;
alter table public.etablissements  enable row level security;
alter table public.campus          enable row level security;
alter table public.classes         enable row level security;
alter table public.periodes        enable row level security;
alter table public.matieres        enable row level security;
alter table public.eleves          enable row level security;
alter table public.seances         enable row level security;
alter table public.presences       enable row level security;
alter table public.evaluations     enable row level security;
alter table public.notes           enable row level security;
alter table public.modeles_fiche   enable row level security;
alter table public.journal_actions enable row level security;
alter table public.usage_chatbot   enable row level security;

-- ---------- 3. Politiques ----------
-- Comptes : chacun voit le sien ; l'admin voit la liste (mais PAS les données pédagogiques)
create policy enseignants_lecture on public.enseignants
  for select to authenticated
  using (id = (select auth.uid()) or public.est_admin());

create policy enseignants_maj_profil on public.enseignants
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- (les droits par colonne plus bas limitent la mise à jour à nom et telephone)

create policy admins_lecture_soi on public.admins
  for select to authenticated
  using (id = (select auth.uid()));

-- Données de l'enseignant : uniquement les siennes, compte validé, en lecture ET en écriture
create policy etablissements_proprio on public.etablissements
  for all to authenticated
  using (public.compte_valide() and enseignant_id = (select auth.uid()))
  with check (public.compte_valide() and enseignant_id = (select auth.uid()));

create policy campus_proprio on public.campus
  for all to authenticated
  using (public.possede_etablissement(etablissement_id))
  with check (public.possede_etablissement(etablissement_id));

create policy classes_proprio on public.classes
  for all to authenticated
  using (public.possede_campus(campus_id))
  with check (public.possede_campus(campus_id));

create policy periodes_proprio on public.periodes
  for all to authenticated
  using (public.possede_classe(classe_id))
  with check (public.possede_classe(classe_id));

create policy matieres_proprio on public.matieres
  for all to authenticated
  using (public.possede_classe(classe_id))
  with check (public.possede_classe(classe_id));

create policy eleves_proprio on public.eleves
  for all to authenticated
  using (public.possede_classe(classe_id))
  with check (public.possede_classe(classe_id));

create policy seances_proprio on public.seances
  for all to authenticated
  using (public.possede_matiere(matiere_id))
  with check (public.possede_matiere(matiere_id));

create policy presences_proprio on public.presences
  for all to authenticated
  using (public.possede_seance(seance_id))
  with check (public.possede_seance(seance_id));

create policy evaluations_proprio on public.evaluations
  for all to authenticated
  using (public.possede_matiere(matiere_id))
  with check (public.possede_matiere(matiere_id));

create policy notes_proprio on public.notes
  for all to authenticated
  using (public.possede_evaluation(evaluation_id))
  with check (public.possede_evaluation(evaluation_id));

create policy modeles_fiche_proprio on public.modeles_fiche
  for all to authenticated
  using (public.possede_etablissement(etablissement_id))
  with check (public.possede_etablissement(etablissement_id));

-- Journal et quotas : lecture de ses propres lignes ; écriture réservée à la fonction serveur
create policy journal_lecture on public.journal_actions
  for select to authenticated
  using (enseignant_id = (select auth.uid()));

create policy usage_lecture on public.usage_chatbot
  for select to authenticated
  using (enseignant_id = (select auth.uid()));

-- ---------- 4. Droits (défense en profondeur, en plus de la RLS) ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Un enseignant ne peut JAMAIS modifier son statut : seulement nom et téléphone
revoke insert, update, delete on public.enseignants from authenticated;
grant update (nom, telephone) on public.enseignants to authenticated;

revoke insert, update, delete on public.admins from authenticated;
revoke insert, update, delete on public.journal_actions from authenticated;
revoke insert, update, delete on public.usage_chatbot from authenticated;

-- Fonctions : rien n'est exécutable par défaut, on ouvre au cas par cas
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.est_admin() to authenticated;
grant execute on function public.compte_valide() to authenticated;
grant execute on function public.possede_etablissement(uuid) to authenticated;
grant execute on function public.possede_campus(uuid) to authenticated;
grant execute on function public.possede_classe(uuid) to authenticated;
grant execute on function public.possede_matiere(uuid) to authenticated;
grant execute on function public.possede_seance(uuid) to authenticated;
grant execute on function public.possede_evaluation(uuid) to authenticated;
grant execute on function public.changer_statut_enseignant(uuid, public.statut_compte) to authenticated;

-- ---------- 5. Stockage des logos : privé, 1 Mo, images sans SVG, un dossier par enseignant ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 1048576,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create policy logos_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'logos' and public.compte_valide()
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy logos_ajout on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos' and public.compte_valide()
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy logos_maj on storage.objects
  for update to authenticated
  using (bucket_id = 'logos' and public.compte_valide()
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'logos' and public.compte_valide()
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy logos_suppression on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos' and public.compte_valide()
         and (storage.foldername(name))[1] = (select auth.uid())::text);
