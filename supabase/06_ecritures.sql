-- =====================================================================
-- 06_ecritures.sql : écritures du chatbot (présences, notes), journal, annulation
-- =====================================================================

alter table public.chatbot_reglages
  add column if not exists ecriture boolean not null default true;

-- Contrôles communs : compte valide, assistant actif, modifications autorisées
create or replace function public.chatbot_verifier_ecriture() returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  r public.chatbot_reglages;
  v_compte boolean;
begin
  if (select auth.uid()) is null or not public.compte_valide() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into r from public.chatbot_reglages limit 1;
  select e.chatbot_actif into v_compte from public.enseignants e
    where e.id = (select auth.uid());
  if not r.actif or not coalesce(v_compte, false) then
    raise exception 'L’assistant est désactivé';
  end if;
  if not r.ecriture then
    raise exception 'Les modifications par l’assistant sont désactivées par l’administrateur';
  end if;
end $$;

create or replace function public.admin_chatbot_ecriture_maj(p_ecriture boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.est_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update public.chatbot_reglages set ecriture = p_ecriture, maj_le = now() where id;
end $$;

-- Écriture + journal dans la même transaction
create or replace function public.chatbot_executer(p_action jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  t text := p_action->>'type';
  v_matiere uuid;
  v_eleve uuid;
  v_evaluation uuid;
  v_seance uuid;
  v_date date;
  v_creneau smallint;
  v_statut public.statut_presence;
  v_valeur numeric;
  v_avant text;
  v_apres text;
  v_creee boolean := false;
  v_journal uuid;
  v_eleves uuid[];
  v_eleve_cible uuid;
  v_lignes jsonb := '[]'::jsonb;
  v_ligne jsonb;
  v_details jsonb;
  v_nombre integer;
  v_remplacements integer := 0;
  v_classe uuid;
  v_note_max numeric;
begin
  perform public.chatbot_verifier_ecriture();

  if jsonb_typeof(p_action->'eleve_ids') = 'array' then
    select array_agg(distinct value::uuid) into v_eleves
      from jsonb_array_elements_text(p_action->'eleve_ids');
  else
    v_eleves := array[(p_action->>'eleve_id')::uuid];
  end if;
  v_nombre := coalesce(cardinality(v_eleves), 0);
  if v_nombre = 0 then
    raise exception 'Aucun élève à modifier';
  end if;

  if t = 'presence' then
    v_matiere := (p_action->>'matiere_id')::uuid;
    v_date := (p_action->>'date')::date;
    v_creneau := coalesce((p_action->>'creneau')::smallint, 1);
    v_statut := (p_action->>'statut')::public.statut_presence;

    select m.classe_id into v_classe from public.matieres m
      where m.id = v_matiere and public.possede_matiere(m.id);
    if v_classe is null then
      raise exception 'Accès refusé' using errcode = '42501';
    end if;
    if (select count(*) from public.eleves e
        where e.id = any(v_eleves) and e.classe_id = v_classe) <> v_nombre then
      raise exception 'Un ou plusieurs élèves ne font pas partie de cette classe';
    end if;

    select s.id into v_seance from public.seances s
      where s.matiere_id = v_matiere and s.date = v_date and s.creneau = v_creneau;
    if v_seance is null then
      insert into public.seances (matiere_id, date, creneau)
        values (v_matiere, v_date, v_creneau) returning id into v_seance;
      v_creee := true;
    end if;

    foreach v_eleve_cible in array v_eleves loop
      v_avant := null;
      select p.statut::text into v_avant from public.presences p
        where p.seance_id = v_seance and p.eleve_id = v_eleve_cible;
      if v_avant is not null then v_remplacements := v_remplacements + 1; end if;

      insert into public.presences (seance_id, eleve_id, statut)
        values (v_seance, v_eleve_cible, v_statut)
        on conflict (seance_id, eleve_id) do update set statut = excluded.statut;
      v_apres := v_statut::text;
      v_lignes := v_lignes || jsonb_build_array(jsonb_build_object(
        'eleve_id', v_eleve_cible, 'avant', v_avant, 'apres', v_apres));
    end loop;

    v_details := jsonb_build_object(
      'seance_id', v_seance, 'matiere_id', v_matiere, 'date', v_date,
      'creneau', v_creneau, 'seance_creee', v_creee);
    if v_nombre = 1 then
      v_details := v_details || (v_lignes->0);
    else
      v_details := v_details || jsonb_build_object('eleves', v_lignes);
    end if;
    insert into public.journal_actions (enseignant_id, source, action, details)
      values (uid, 'chatbot', 'presence', v_details)
      returning id into v_journal;

  elsif t = 'note' then
    v_evaluation := (p_action->>'evaluation_id')::uuid;
    v_valeur := (p_action->>'valeur')::numeric;

    select m.classe_id, ev.note_max into v_classe, v_note_max
      from public.evaluations ev
      join public.matieres m on m.id = ev.matiere_id
      where ev.id = v_evaluation and public.possede_evaluation(ev.id);
    if v_classe is null then
      raise exception 'Accès refusé' using errcode = '42501';
    end if;
    if v_valeur < 0 or v_valeur > v_note_max then
      raise exception 'La note doit être comprise entre 0 et %', v_note_max;
    end if;
    if (select count(*) from public.eleves e
        where e.id = any(v_eleves) and e.classe_id = v_classe) <> v_nombre then
      raise exception 'Un ou plusieurs élèves ne font pas partie de cette classe';
    end if;

    foreach v_eleve_cible in array v_eleves loop
      v_avant := null;
      select n.valeur::text into v_avant from public.notes n
        where n.evaluation_id = v_evaluation and n.eleve_id = v_eleve_cible;
      if v_avant is not null then v_remplacements := v_remplacements + 1; end if;

      insert into public.notes (evaluation_id, eleve_id, valeur)
        values (v_evaluation, v_eleve_cible, v_valeur)
        on conflict (evaluation_id, eleve_id) do update set valeur = excluded.valeur;
      select n.valeur::text into v_apres from public.notes n
        where n.evaluation_id = v_evaluation and n.eleve_id = v_eleve_cible;
      v_lignes := v_lignes || jsonb_build_array(jsonb_build_object(
        'eleve_id', v_eleve_cible, 'avant', v_avant, 'apres', v_apres));
    end loop;

    v_details := jsonb_build_object('evaluation_id', v_evaluation);
    if v_nombre = 1 then
      v_details := v_details || (v_lignes->0);
    else
      v_details := v_details || jsonb_build_object('eleves', v_lignes);
    end if;
    insert into public.journal_actions (enseignant_id, source, action, details)
      values (uid, 'chatbot', 'note', v_details)
      returning id into v_journal;

  else
    raise exception 'Action inconnue';
  end if;

  return jsonb_build_object(
    'journal_id', v_journal, 'avant', v_avant, 'apres', v_apres,
    'nombre', v_nombre, 'remplacements', v_remplacements);
end $$;

-- Annulation : restaure l'ancienne valeur, sauf si elle a changé depuis
create or replace function public.chatbot_annuler(p_journal uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  j public.journal_actions;
  d jsonb;
  v_courant text;
  v_courant_num numeric;
  v_ligne jsonb;
begin
  perform public.chatbot_verifier_ecriture();

  select * into j from public.journal_actions
    where id = p_journal and enseignant_id = uid and source = 'chatbot'
    for update;
  if j.id is null then
    raise exception 'Action introuvable';
  end if;
  if j.annule then
    raise exception 'Action déjà annulée';
  end if;
  d := j.details;

  if jsonb_typeof(d->'eleves') = 'array' then
    for v_ligne in select value from jsonb_array_elements(d->'eleves') loop
      if j.action = 'presence' then
        if not public.possede_seance((d->>'seance_id')::uuid) then
          raise exception 'Annulation impossible : élément supprimé ou inaccessible';
        end if;
        select p.statut::text into v_courant from public.presences p
          where p.seance_id = (d->>'seance_id')::uuid
            and p.eleve_id = (v_ligne->>'eleve_id')::uuid;
        if v_courant is distinct from v_ligne->>'apres' then
          raise exception 'Une présence a changé depuis : annulation impossible';
        end if;
        if v_ligne->>'avant' is null then
          delete from public.presences
            where seance_id = (d->>'seance_id')::uuid
              and eleve_id = (v_ligne->>'eleve_id')::uuid;
        else
          update public.presences
            set statut = (v_ligne->>'avant')::public.statut_presence
            where seance_id = (d->>'seance_id')::uuid
              and eleve_id = (v_ligne->>'eleve_id')::uuid;
        end if;
      elsif j.action = 'note' then
        if not public.possede_evaluation((d->>'evaluation_id')::uuid) then
          raise exception 'Annulation impossible : élément supprimé ou inaccessible';
        end if;
        select n.valeur into v_courant_num from public.notes n
          where n.evaluation_id = (d->>'evaluation_id')::uuid
            and n.eleve_id = (v_ligne->>'eleve_id')::uuid;
        if v_courant_num is distinct from (v_ligne->>'apres')::numeric then
          raise exception 'Une note a changé depuis : annulation impossible';
        end if;
        if v_ligne->>'avant' is null then
          delete from public.notes
            where evaluation_id = (d->>'evaluation_id')::uuid
              and eleve_id = (v_ligne->>'eleve_id')::uuid;
        else
          update public.notes set valeur = (v_ligne->>'avant')::numeric
            where evaluation_id = (d->>'evaluation_id')::uuid
              and eleve_id = (v_ligne->>'eleve_id')::uuid;
        end if;
      else
        raise exception 'Action inconnue';
      end if;
    end loop;

    if j.action = 'presence' and (d->>'seance_creee')::boolean
       and not exists (select 1 from public.presences where seance_id = (d->>'seance_id')::uuid) then
      delete from public.seances where id = (d->>'seance_id')::uuid;
    end if;

  elsif j.action = 'presence' then
    if not public.possede_seance((d->>'seance_id')::uuid) then
      raise exception 'Annulation impossible : élément supprimé ou inaccessible';
    end if;
    select p.statut::text into v_courant from public.presences p
      where p.seance_id = (d->>'seance_id')::uuid and p.eleve_id = (d->>'eleve_id')::uuid;
    if v_courant is distinct from d->>'apres' then
      raise exception 'La présence a changé depuis : annulation impossible';
    end if;
    if d->>'avant' is null then
      delete from public.presences
        where seance_id = (d->>'seance_id')::uuid and eleve_id = (d->>'eleve_id')::uuid;
    else
      update public.presences set statut = (d->>'avant')::public.statut_presence
        where seance_id = (d->>'seance_id')::uuid and eleve_id = (d->>'eleve_id')::uuid;
    end if;
    if (d->>'seance_creee')::boolean
       and not exists (select 1 from public.presences where seance_id = (d->>'seance_id')::uuid) then
      delete from public.seances where id = (d->>'seance_id')::uuid;
    end if;

  elsif j.action = 'note' then
    if not public.possede_evaluation((d->>'evaluation_id')::uuid) then
      raise exception 'Annulation impossible : élément supprimé ou inaccessible';
    end if;
    select n.valeur into v_courant_num from public.notes n
      where n.evaluation_id = (d->>'evaluation_id')::uuid and n.eleve_id = (d->>'eleve_id')::uuid;
    if v_courant_num is distinct from (d->>'apres')::numeric then
      raise exception 'La note a changé depuis : annulation impossible';
    end if;
    if d->>'avant' is null then
      delete from public.notes
        where evaluation_id = (d->>'evaluation_id')::uuid and eleve_id = (d->>'eleve_id')::uuid;
    else
      update public.notes set valeur = (d->>'avant')::numeric
        where evaluation_id = (d->>'evaluation_id')::uuid and eleve_id = (d->>'eleve_id')::uuid;
    end if;

  else
    raise exception 'Action inconnue';
  end if;

  update public.journal_actions set annule = true where id = j.id;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function
  public.chatbot_verifier_ecriture(),
  public.admin_chatbot_ecriture_maj(boolean),
  public.chatbot_executer(jsonb),
  public.chatbot_annuler(uuid)
from public, anon, authenticated;

grant execute on function
  public.admin_chatbot_ecriture_maj(boolean),
  public.chatbot_executer(jsonb),
  public.chatbot_annuler(uuid)
to authenticated;