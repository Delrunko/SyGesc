-- Ajouter les coordonnées de l'établissement aux documents imprimables.
-- À exécuter une fois sur les projets Supabase déjà initialisés.
alter table public.etablissements
  add column if not exists adresse text
    check (adresse is null or char_length(adresse) <= 300),
  add column if not exists telephone text
    check (telephone is null or char_length(telephone) <= 30),
  add column if not exists email text
    check (email is null or char_length(email) <= 254),
  add column if not exists site_web text
    check (site_web is null or char_length(site_web) <= 255);
