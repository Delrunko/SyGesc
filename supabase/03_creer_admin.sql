-- =====================================================================
-- 03_creer_admin.sql : faire de TON compte un administrateur
-- 1. Crée d'abord ton compte (Authentication > Users > Add user, ou inscription)
-- 2. Remplace l'email ci-dessous, puis exécute
-- Il n'existe AUCUN formulaire pour devenir admin : uniquement cette requête.
-- Active ensuite l'authentification à deux facteurs sur ce compte.
-- =====================================================================
insert into public.admins (id)
select id from auth.users where email = 'TON_EMAIL@exemple.com'
on conflict do nothing;

-- Valider un enseignant (exemple, à faire depuis l'interface admin plus tard) :
-- select public.changer_statut_enseignant('UUID_ENSEIGNANT', 'valide');
