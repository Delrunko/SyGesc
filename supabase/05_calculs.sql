-- =====================================================================
-- 05_calculs.sql : calculs définis une seule fois (moyennes, rang, présences)
-- SECURITY INVOKER : la RLS s'applique, chacun ne calcule que sur ses données.
-- =====================================================================

-- Moyennes par matière, moyenne générale, rang : une ligne par élève, un seul appel
create or replace function public.resultats_classe(p_classe uuid)
returns table (
  eleve_id uuid, matricule text, nom text,
  moyenne_generale numeric, rang integer, effectif integer,
  par_matiere jsonb
)
language sql stable security invoker set search_path = ''
as $$
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
  order by c.rang nulls last, e.nom
$$;

-- Présences, absences, taux de présence par élève (jamais stockés)
create or replace function public.absences_classe(p_classe uuid)
returns table (
  eleve_id uuid, presents integer, absents integer, excuses integer,
  taux_presence numeric
)
language sql stable security invoker set search_path = ''
as $$
  select e.id,
         (count(p.id) filter (where p.statut = 'present'))::integer,
         (count(p.id) filter (where p.statut = 'absent'))::integer,
         (count(p.id) filter (where p.statut = 'excuse'))::integer,
         case when count(p.id) = 0 then null
              else round(100.0 * count(p.id) filter (where p.statut = 'present') / count(p.id), 1)
         end
  from public.eleves e
  left join public.presences p on p.eleve_id = e.id
  where e.classe_id = p_classe
  group by e.id
$$;

revoke execute on function public.resultats_classe(uuid), public.absences_classe(uuid)
  from public, anon;
grant execute on function public.resultats_classe(uuid), public.absences_classe(uuid)
  to authenticated;