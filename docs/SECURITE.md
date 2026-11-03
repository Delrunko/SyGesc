# Sécurité

Principe : **tout est interdit par défaut**, on autorise le strict nécessaire, à plusieurs niveaux.
Une faille à un niveau ne doit jamais suffire.

## 1. Base de données (niveau le plus important)
- **RLS activée sur toutes les tables** ; sans politique, aucun accès. Le rôle `anon` n'a aucun droit.
- Un enseignant n'accède qu'à **ses** données (chaîne établissement → campus → classe → matière…),
  en lecture **et** en écriture (`with check`) : impossible de rattacher une ligne à la classe d'un autre.
- **Compte non validé = aucun accès** aux données, même connecté.
- Le statut d'un compte ne change que via `changer_statut_enseignant`, réservée aux admins.
  Un enseignant ne peut modifier que son nom et son téléphone (droits par colonne).
- Le rôle `role_acces` est attribué uniquement par l'admin via `changer_role_enseignant` :
  `enseignant` (liste de notes) ou `responsable` (moyennes, classements, bulletins et gestion des périodes).
- Les fonctions de calcul complet vérifient le rôle côté base; l'enseignant standard ne reçoit que la liste
  par élève et par évaluation. La lecture des périodes est permise aux comptes validés, leur modification
  est réservée au responsable pédagogique.
- Le profil est créé par un déclencheur côté base avec statut `en_attente` imposé :
  impossible de s'inscrire déjà « validé ».
- L'admin voit la liste des comptes, **pas** les élèves, notes ou présences.
- Les champs personnalisés des élèves sont définis par classe et protégés par les mêmes règles RLS ;
  ne collecte que les informations nécessaires, en particulier pour les données concernant des mineurs.
- Intégrité : un élève ne peut être lié qu'à une séance ou évaluation de sa classe ; une note doit
  respecter le barème ; contraintes de taille et de format sur tous les champs texte et JSON.
- Fonctions `SECURITY DEFINER` avec `search_path` vide ; exécution limitée aux utilisateurs connectés.

## 2. Authentification (à régler dans le tableau de bord Supabase)
- Confirmation d'email obligatoire.
- Mot de passe : 10 caractères minimum ; activer la protection contre les mots de passe compromis si ton
  offre le permet.
- CAPTCHA sur inscription et connexion.
- Désactiver les connexions anonymes.
- Conserver les limites de débit ; n'autoriser comme URL de redirection que ton domaine.
- **Compte admin** : authentification à deux facteurs (MFA) ; création uniquement par SQL (`03_creer_admin.sql`).
- Les notifications de compte sont privées par utilisateur grâce à la RLS. Seuls les déclencheurs SQL peuvent les créer; un utilisateur ne peut lire et marquer comme lues que ses propres notifications.
- La réinitialisation d’un mot de passe enseignant passe par la fonction serveur `admin-password-reset` :
  elle valide le JWT, vérifie l’appartenance à `admins`, génère un secret provisoire et exige son remplacement.
  La clé `service_role` ne quitte jamais les secrets de la fonction.

## 3. Clés et secrets
- Clé `anon` : publique par conception (protégée par la RLS). Clé `service_role` : **jamais** dans le front,
  jamais dans Git ; uniquement dans les secrets des fonctions serveur du chatbot et de récupération de compte.
- `.env` exclu de Git (déjà dans `.gitignore`). Régénérer les clés en cas de fuite.

## 4. Chatbot
- Fonctions fermées uniquement ; **jamais de SQL libre** généré par le modèle.
- Les lectures utilisent la **session de l'enseignant** (RLS appliquée). La clé `service_role` sert seulement
  à écrire le journal et les quotas.
- **Injection de prompt** : noms d'élèves, champs libres et fichiers importés sont des **données non fiables** ;
  ils ne doivent jamais être traités comme des instructions.
- Toute écriture passe par une **confirmation explicite** ; validation stricte des arguments (types, bornes,
  identifiants appartenant à l'enseignant) ; journal de chaque action et possibilité d'annuler.
- Quota par enseignant et limite de longueur des messages (maîtrise du coût et des abus).

## 5. Import et export
- Import Excel : taille maximale, nombre de lignes maximal, types de fichier vérifiés, valeurs nettoyées.
- **Injection de formules** dans l'export Excel : préfixer par `'` toute cellule commençant par
  `=`, `+`, `-` ou `@`.
- Logos : PNG, JPEG ou WebP, 1 Mo maximum, **pas de SVG** ; bucket privé, un dossier par enseignant.

## 6. Front et hébergement
- Pas de `dangerouslySetInnerHTML` ; HTTPS obligatoire.
- En-têtes de sécurité à l'hébergement (Content-Security-Policy, X-Content-Type-Options, frame-ancestors).
- `npm audit` régulier ; dépendances à jour.

## 7. Données personnelles
Les données concernent en grande partie des **mineurs** : ne collecter que le nécessaire, prévoir
sauvegardes, suppression à la demande, conditions d'utilisation et politique de confidentialité.
Vérifier les obligations de la loi camerounaise sur la protection des données personnelles.

## 8. Checklist avant mise en ligne
- [ ] Deux comptes enseignants validés : aucun ne voit les données de l'autre (lecture, modification, suppression).
- [ ] Compte « en attente » : aucune donnée visible.
- [ ] Sans connexion (`anon`) : aucune table accessible.
- [ ] Un enseignant ne peut pas changer son statut (essai via l'API).
- [ ] RLS active sur toutes les tables (Advisors de Supabase sans alerte).
- [ ] MFA sur le compte admin ; CAPTCHA actif ; confirmation d'email active.
- [ ] Aucune clé secrète dans le code ni dans Git.
- [ ] Sauvegardes de la base configurées.
