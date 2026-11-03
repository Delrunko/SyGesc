# Récupération de compte administrée

L’administrateur ne peut pas consulter un mot de passe existant. Il peut seulement en générer un nouveau, provisoire, après avoir vérifié l’identité de l’enseignant.

## Déploiement

Depuis la racine du projet, lier le projet Supabase puis déployer la fonction :

```powershell
npx supabase login
npx supabase link --project-ref <référence-du-projet>
npx supabase functions deploy admin-password-reset
```

La fonction utilise les variables serveur fournies par Supabase, dont `SUPABASE_SERVICE_ROLE_KEY`. Ne jamais copier cette clé dans `.env`, Cloudflare ou le code du navigateur. La vérification JWT de la fonction doit rester activée.

## Utilisation

1. L’enseignant contacte l’administrateur en indiquant son nom complet.
2. Après vérification, l’administrateur ouvre **Comptes enseignants** et choisit **Réinitialiser le mot de passe**.
3. Le mot de passe provisoire n’est affiché qu’une fois. L’administrateur le transmet directement à l’enseignant par un canal sûr.
4. À la connexion, l’application impose le choix d’un nouveau mot de passe d’au moins 10 caractères.

La fonction refuse les appels non authentifiés, les comptes ne figurant pas dans `enseignants` et les comptes administrateurs. Les liens de récupération par email précédemment envoyés restent pris en charge.
