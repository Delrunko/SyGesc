-- Périodes / bulletins trimestriels et index pour le calendrier des présences.
-- Les tables periodes et leurs politiques RLS sont créées dans 01_schema.sql et 02_securite.sql.

create index if not exists seances_matiere_date_idx
  on public.seances (matiere_id, date);

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
language sql stable security invoker set search_path = ''
as $$
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
  order by c.rang nulls last, e.nom
$$;

revoke execute on function public.resultats_classe_periode(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.resultats_classe_periode(uuid, date, date)
  to authenticated;
