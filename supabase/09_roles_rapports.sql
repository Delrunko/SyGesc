-- Rôles d'accès aux rapports : les comptes existants restent enseignants par défaut.
alter table public.enseignants
  add column if not exists role_acces text not null default 'enseignant'
    check (role_acces in ('enseignant', 'responsable'));

create or replace function public.est_responsable_pedagogique()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.enseignants
    where id = (select auth.uid())
      and statut = 'valide'
      and role_acces = 'responsable'
  )
$$;

create or replace function public.changer_role_enseignant(p_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_role not in ('enseignant', 'responsable') then
    raise exception 'Rôle invalide' using errcode = '22023';
  end if;
  update public.enseignants set role_acces = p_role where id = p_id;
  if not found then
    raise exception 'Compte enseignant introuvable' using errcode = 'P0002';
  end if;
end
$$;

drop policy if exists periodes_proprio on public.periodes;
create policy periodes_lecture_proprio on public.periodes
  for select to authenticated
  using (public.possede_classe(classe_id));
create policy periodes_ajout_responsable on public.periodes
  for insert to authenticated
  with check (public.est_responsable_pedagogique() and public.possede_classe(classe_id));
create policy periodes_modification_responsable on public.periodes
  for update to authenticated
  using (public.est_responsable_pedagogique() and public.possede_classe(classe_id))
  with check (public.est_responsable_pedagogique() and public.possede_classe(classe_id));
create policy periodes_suppression_responsable on public.periodes
  for delete to authenticated
  using (public.est_responsable_pedagogique() and public.possede_classe(classe_id));

-- Liste de notes par évaluation : pas de moyenne générale, classement ni bulletin.
create or replace function public.liste_notes_classe(
  p_classe uuid,
  p_debut date default null,
  p_fin date default null
)
returns table (
  eleve_id uuid, matricule text, nom text, matiere text,
  evaluation text, date_evaluation date, valeur numeric, note_max numeric
)
language sql stable security invoker set search_path = ''
as $$
  select e.id, e.matricule, e.nom, m.nom, ev.titre, ev.date, n.valeur, ev.note_max
  from public.eleves e
  join public.matieres m on m.classe_id = e.classe_id
  join public.evaluations ev on ev.matiere_id = m.id
  left join public.notes n on n.evaluation_id = ev.id and n.eleve_id = e.id
  where e.classe_id = p_classe
    and (p_debut is null or ev.date >= p_debut)
    and (p_fin is null or ev.date <= p_fin)
  order by e.nom, ev.date, m.nom, ev.titre
$$;

-- Secrétariat/responsable uniquement : classement et moyennes agrégées.
create or replace function public.resultats_classe(p_classe uuid)
returns table (
  eleve_id uuid, matricule text, nom text,
  moyenne_generale numeric, rang integer, effectif integer,
  par_matiere jsonb
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not public.est_responsable_pedagogique() then
    raise exception 'Réservé au secrétariat / responsable pédagogique'
      using errcode = '42501';
  end if;
  return query
  with brutes as (
    select n.eleve_id as eid, ev.matiere_id as mid, m.coefficient as coef_mat,
           sum(n.valeur / ev.note_max * 20 * ev.coefficient) / sum(ev.coefficient) as moy
    from public.notes n
    join public.evaluations ev on ev.id = n.evaluation_id
    join public.matieres m on m.id = ev.matiere_id
    where m.classe_id = p_classe
    group by n.eleve_id, ev.matiere_id, m.coefficient
  ),
  generales as (
    select b.eid,
           sum(b.moy * b.coef_mat) / sum(b.coef_mat) as gen,
           jsonb_object_agg(b.mid, b.moy) as par_matiere
    from brutes b
    group by b.eid
  ),
  classes as (
    select g.eid, g.gen, g.par_matiere,
           rank() over (order by g.gen desc)::integer as rang
    from generales g
  )
  select e.id, e.matricule, e.nom, c.gen, c.rang,
         (count(c.rang) over ())::integer,
         c.par_matiere
  from public.eleves e
  left join classes c on c.eid = e.id
  where e.classe_id = p_classe
  order by c.rang nulls last, e.nom;
end
$$;

create or replace function public.resultats_classe_periode(
  p_classe uuid,
  p_debut date,
  p_fin date
)
returns table (
  eleve_id uuid, matricule text, nom text,
  moyenne_generale numeric, rang integer, effectif integer,
  par_matiere jsonb
)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not public.est_responsable_pedagogique() then
    raise exception 'Réservé au secrétariat / responsable pédagogique'
      using errcode = '42501';
  end if;
  return query
  with brutes as (
    select n.eleve_id as eid, ev.matiere_id as mid, m.coefficient as coef_mat,
           sum(n.valeur / ev.note_max * 20 * ev.coefficient) / sum(ev.coefficient) as moy
    from public.notes n
    join public.evaluations ev on ev.id = n.evaluation_id
    join public.matieres m on m.id = ev.matiere_id
    where m.classe_id = p_classe
      and ev.date between p_debut and p_fin
    group by n.eleve_id, ev.matiere_id, m.coefficient
  ),
  generales as (
    select b.eid,
           sum(b.moy * b.coef_mat) / sum(b.coef_mat) as gen,
           jsonb_object_agg(b.mid, b.moy) as par_matiere
    from brutes b
    group by b.eid
  ),
  classes as (
    select g.eid, g.gen, g.par_matiere,
           rank() over (order by g.gen desc)::integer as rang
    from generales g
  )
  select e.id, e.matricule, e.nom, c.gen, c.rang,
         (count(c.rang) over ())::integer,
         c.par_matiere
  from public.eleves e
  left join classes c on c.eid = e.id
  where e.classe_id = p_classe
  order by c.rang nulls last, e.nom;
end
$$;

revoke execute on function public.est_responsable_pedagogique(),
  public.changer_role_enseignant(uuid, text),
  public.liste_notes_classe(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.est_responsable_pedagogique(),
  public.liste_notes_classe(uuid, date, date)
  to authenticated;
grant execute on function public.changer_role_enseignant(uuid, text)
  to authenticated;
grant execute on function public.resultats_classe(uuid),
  public.resultats_classe_periode(uuid, date, date)
  to authenticated;
