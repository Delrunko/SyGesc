# Gestion scolaire — plateforme pour enseignants

Application web : l'enseignant gère ses établissements, campus, classes, élèves, présences et notes,
exporte ses fiches (PDF / Excel) et interroge ses données via un chatbot.

Stack : React (Vite) + Supabase (PostgreSQL, authentification, stockage). Aucun serveur Python.

## Contenu
- `docs/CONCEPTION.md` : conception complète (acteurs, parcours, données, chatbot, interface)
- `docs/SECURITE.md`   : stratégie de sécurité et checklist avant mise en ligne
- `supabase/`          : scripts SQL à exécuter dans l'ordre
- `src/`               : squelette React avec thème clair / sombre (bleu, rouge, blanc)

## Démarrage
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner les clés Supabase (clé "anon" uniquement)
3. `npm run dev`

## Configuration Supabase (ordre)
1. Créer le projet Supabase
2. SQL Editor : exécuter `01_schema.sql`, puis `02_securite.sql`
   (`00_reset_dev.sql` sert uniquement à repartir de zéro en développement)
3. Exécuter `04_chatbot.sql`, `05_calculs.sql` et `06_ecritures.sql` pour activer les réponses,
   les statistiques et les écritures confirmées de l'assistant
   (réexécuter le script `06_ecritures.sql` après une mise à jour pour activer les modifications groupées et leur annulation)
4. Exécuter `07_entetes_documents.sql` pour ajouter les coordonnées des établissements
5. Exécuter `08_periodes_suivi.sql` pour activer les moyennes par période et optimiser le calendrier des absences
6. Exécuter `09_roles_rapports.sql` pour activer les rôles d'accès aux bulletins
7. Exécuter `10_notifications.sql` pour alerter l’administration aux inscriptions et notifier les enseignants lors de leur validation (active aussi Realtime sur les tables `notifications` et `enseignants`)
8. Régler l'authentification (voir `docs/SECURITE.md`, section 2)
9. Créer ton compte, puis exécuter `03_creer_admin.sql` en remplaçant l'email d'exemple par le tien
10. Dans l'application, valider les comptes et attribuer les rôles depuis l'interface d'administration

## Périodes scolaires et absences
- Dans les résultats de chaque classe, configure les trimestres/périodes et leurs dates; chaque évaluation datée entre ces bornes est incluse dans les moyennes et bulletins de la période.
- Les bulletins individuels indiquent la période et résument les absences correspondantes. L’option « Année entière » conserve le calcul habituel.
- L’onglet Présences comprend un calendrier mensuel; sélectionne un jour pour consulter les séances et élèves absents/excusés, puis ouvre la séance pour corriger les états.
- Le rôle « Enseignant » (par défaut) affiche et permet d’imprimer/exporter la liste détaillée des notes par élève et évaluation; les moyennes générales, classements et bulletins sont réservés au rôle « Secrétaire / Responsable pédagogique ».
- L’enseignant voit également un graphique agrégé de répartition des moyennes indicatives par tranche, calculées à partir des notes saisies et normalisées sur 20. Aucune moyenne individuelle ni aucun classement n’est affiché dans cette vue.
- L’admin attribue ou retire ce rôle depuis la liste des comptes enseignants. La migration `09_roles_rapports.sql` protège aussi les changements de rôle, la gestion des périodes et les fonctions de calcul des bulletins côté Supabase.
- Le centre de notifications signale en direct les nouvelles inscriptions aux administrateurs et confirme à l’enseignant la validation de son compte. Les alertes restent consultables après reconnexion; exécuter `10_notifications.sql` pour activer cette fonctionnalité.

### Récupération du mot de passe
- Depuis l’écran de connexion, l’enseignant contacte l’administrateur, qui peut générer un mot de passe provisoire depuis « Comptes enseignants ». L’ancien mot de passe n’est jamais consultable.
- Dans « Comptes enseignants », sélectionner le nom ouvre une fiche détaillée avec l’adresse email et les informations du compte. L’email est renvoyé par la fonction sécurisée uniquement après vérification des droits administrateur.
- Déployer la fonction sécurisée avec `npx supabase login`, `npx supabase link --project-ref <référence-du-projet>`, puis `npx supabase functions deploy admin-password-reset`.
- La fonction vérifie la session et le rôle admin côté serveur, utilise la clé `service_role` uniquement dans l’environnement Supabase, puis impose le changement du mot de passe provisoire à la prochaine connexion.
- Transmettre le mot de passe provisoire par un canal sûr et demander à l’enseignant de le remplacer immédiatement. La fonction est protégée par vérification JWT; ne pas désactiver cette vérification.
- Cette procédure évite le SMTP, mais utilise toujours l’authentification Supabase. Les liens de récupération par email déjà envoyés continuent de fonctionner.
- Si l’interface affiche « Impossible de joindre la fonction Supabase » ou « Supabase ne trouve pas la fonction », vérifier que la fonction a bien été déployée sur le même projet que `VITE_SUPABASE_URL`; le déploiement Cloudflare du site ne déploie pas les fonctions Supabase.

## Application installable (PWA)
- Déployer le site en HTTPS (ou sur `localhost` en développement) pour activer le service worker et l’installation.
- `npm run build`, puis `npm run preview` pour vérifier la version de production ; l’application propose l’installation sur les navigateurs compatibles et indique la procédure manuelle sur iOS.
- La coque et les ressources statiques sont disponibles hors connexion. Les appels Supabase et les données scolaires ne sont jamais mis en cache et nécessitent Internet.
- Incrémenter `CACHE_NAME` dans `public/sw.js` à chaque évolution de la stratégie de cache ; l’activation supprimera les anciennes coques.
- Les mentions légales, la politique de confidentialité et les conditions d’utilisation sont accessibles depuis l’écran de connexion. L’éditeur y est indiqué comme Million's, le site comme hébergé par Cloudflare, et les coordonnées indiquées sont celles communiquées par l’exploitant.
- Avant toute ouverture commerciale, faire valider ces documents et compléter la forme juridique, l’adresse professionnelle, le numéro d’immatriculation, le directeur de publication, les détails légaux du produit Cloudflare utilisé, la région Supabase, les durées de conservation et le droit applicable.

## Déploiement Cloudflare Workers
- Le fichier `wrangler.toml` configure le Worker `sygesc` pour servir le dossier `dist/` et renvoyer `index.html` sur les routes de l’application React.
- Dans Workers & Pages → `sygesc` → Settings → Variables and Secrets, ajouter `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` comme variables de **build** (configuration Production et Preview si les deux sont utilisées). Utiliser uniquement la clé Supabase `anon`/publishable; ne jamais mettre `service_role` dans les variables du front.
- Configuration du déploiement : commande de build `npm run build`, commande de déploiement `npx wrangler deploy`, dossier de sortie `dist`. Le `wrangler.toml` à la racine empêche Wrangler de demander une configuration interactive pendant le build automatique.
- Après le premier déploiement, ajouter le domaine `*.workers.dev` ou le domaine personnalisé dans Supabase → Authentication → URL Configuration (Site URL et Redirect URLs), notamment pour l’inscription par email et la récupération du compte. Ajouter aussi ce domaine à la liste autorisée de Google OAuth si cette connexion est activée.
- Pour déployer depuis un poste connecté à Cloudflare : `npm install`, `npm run build`, puis `npm run deploy`.

## En-tête des documents scolaires
- Dans la fiche d’un établissement, renseigner l’adresse, le téléphone, l’email, le site web et le logo.
- Les bulletins et les exports/impressions des résultats reprennent ces coordonnées ainsi que le nom de l’enseignant connecté, la classe, l’année et les matières.
- Pour un projet Supabase existant, exécuter `supabase/07_entetes_documents.sql` avant de saisir les coordonnées.
#   S y G e s c  
 #   S y G e s c  
 