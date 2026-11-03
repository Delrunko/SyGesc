# Conception — Plateforme de gestion scolaire pour enseignants

## 1. Vision
Permettre à un enseignant de gérer présences et notes de ses élèves sans erreurs ni paperasse, et d'obtenir
des statistiques en une phrase grâce à un chatbot. Arguments de vente : **chatbot qui lit ET saisit**,
**multi-classes / multi-campus / multi-établissements**, **périodes** (trimestres, séquences).

## 2. Acteurs
- **Enseignant** : s'inscrit, crée sa structure, gère élèves, présences, notes, fiches, chatbot.
- **Admin (développeur)** : valide ou refuse les inscriptions. Ne voit PAS les élèves, notes ni présences.
- Hors périmètre pour l'instant : parents, élèves, direction.

## 3. Parcours
1. **Inscription** : compte créé « en attente ». Aucun accès aux données tant que l'admin n'a pas validé.
2. **Structure** : l'enseignant crée établissement → campus → classe → matières (+ périodes de la classe).
3. **Élèves** : l'enseignant définit les champs propres à chaque classe (texte, nombre, date ou liste de choix),
   puis renseigne ces informations à l'inscription ou les modifie dans l'annuaire. L'import Excel/PDF peut
   aussi associer les colonnes aux champs personnalisés ; nom et matricule restent obligatoires.
4. **Présences** : une fiche par séance ; statuts présent (vert), absent (rouge), excusé (gris).
5. **Notes** : évaluations par matière (coefficient, barème), saisie des notes par élève.
6. **Fiches** : export PDF ou Excel de la fiche de notes de la classe (et fiche de présence au choix).
7. **Chatbot** : questions et saisie en langage naturel.

## 4. Modèle de données
| Table | Rôle |
|---|---|
| enseignants | profil + statut (en_attente / valide / refuse) |
| admins | comptes administrateurs |
| etablissements | créés par l'enseignant ; logo |
| campus | rattaché à un établissement |
| classes | rattachée à un campus ; année scolaire ; définition des champs personnalisés des élèves |
| periodes | trimestres / séquences d'une classe (dates début et fin) |
| matieres | rattachée à une classe ; coefficient |
| eleves | matricule, nom, valeurs des champs personnalisés (JSON, selon la classe) |
| seances, presences | présences par séance |
| evaluations, notes | notes par évaluation (barème vérifié) |
| modeles_fiche | logo + rubriques d'en-tête + colonnes, par établissement |
| journal_actions, usage_chatbot | traçabilité du chatbot et quotas |

Les séances et évaluations sont rattachées à une période **par leur date**.

## 5. Fiches et exports
- Une **seule mise en page** définie par `modeles_fiche`, deux formats de sortie : PDF et Excel.
- L'enseignant renseigne **logo** et **rubriques** une fois par établissement.
- Contenu : en-tête (logo + rubriques), tableau des élèves, notes par évaluation, moyenne pondérée.
- Export par période ou sur l'année.

## 6. Chatbot
**Principe** : le chatbot ne calcule rien, il appelle des **fonctions fermées** ; la base calcule.
- Lecture : moyennes (élève, classe, matière), classements, élèves sous un seuil, absences, taux de
  présence, évolution d'un élève, recherche par nom ou matricule, comparaisons entre périodes.
- Écriture : marquer une présence, enregistrer une note, saisie groupée
  (« tous présents sauf Paul et Marie », « Paul 14, Marie 12 au devoir 2 »).
- **Écriture toujours avec confirmation** (carte récapitulative), annulation possible, historique.
- Portée : classe ouverte par défaut, mais accès à toutes les classes de l'enseignant.
- Ambiguïté (homonymes, période absente) : il pose la question au lieu de deviner.
- Exécution dans une **fonction serveur Supabase** (Edge Function) : la clé du modèle n'est jamais dans le
  navigateur ; la session de l'enseignant est transmise, donc les règles RLS s'appliquent.
- Quota de messages par jour/mois selon la formule (coût d'usage à intégrer dans le prix).

## 7. Interface
- Deux modes : **clair** et **sombre** (préférence mémorisée, sinon préférence du système).
- Couleurs : **bleu** (actions), **rouge** (actions sensibles, absences), **blanc** (fonds).
- Présences : vert / rouge / gris. Contrastes vérifiés pour la lisibilité.

## 8. Règles à trancher
- Suppression d'une classe contenant des données : archivage plutôt que suppression ?
- Réinscription après refus.
- Import Excel : doublons de matricule, lignes vides, colonnes inconnues.
- Formule de moyenne : pondérée par les coefficients, notes ramenées sur 20.
- Quotas chatbot et tarifs.

## 9. Feuille de route
1. Configuration Supabase  2. Authentification, inscription, validation admin
3. Structure (établissement → matière)  4. Élèves + import Excel  5. Présences
6. Notes + périodes  7. Exports PDF / Excel  8. Chatbot lecture  9. Chatbot écriture
10. Durcissement et mise en production
