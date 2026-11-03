-- =====================================================================
-- 00_reset_dev.sql : REMISE À ZÉRO (développement uniquement)
-- NE JAMAIS EXÉCUTER EN PRODUCTION : supprime toutes les données.
-- =====================================================================
drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists logos_lecture on storage.objects;
drop policy if exists logos_ajout on storage.objects;
drop policy if exists logos_maj on storage.objects;
drop policy if exists logos_suppression on storage.objects;

drop table if exists
  public.notifications, public.usage_chatbot, public.journal_actions, public.modeles_fiche,
  public.notes, public.evaluations, public.presences, public.seances,
  public.eleves, public.matieres, public.periodes, public.classes,
  public.campus, public.etablissements, public.admins, public.enseignants,
  public.affectations
cascade;

drop type if exists public.statut_presence, public.statut_compte;

drop function if exists public.creer_profil_enseignant();
drop function if exists public.notifier_nouvelle_inscription();
drop function if exists public.notifier_validation_enseignant();
drop function if exists public.verifier_presence();
drop function if exists public.verifier_note();
drop function if exists public.changer_statut_enseignant(uuid, public.statut_compte);
drop function if exists public.possede_evaluation(uuid);
drop function if exists public.possede_seance(uuid);
drop function if exists public.possede_matiere(uuid);
drop function if exists public.possede_classe(uuid);
drop function if exists public.possede_campus(uuid);
drop function if exists public.possede_etablissement(uuid);
drop function if exists public.compte_valide();
drop function if exists public.est_admin();
