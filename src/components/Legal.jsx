export const VERSION_DOCUMENTS = '2026-11-03'
const DATE_MISE_A_JOUR = '3 novembre 2026'

function CoordonneesEditeur() {
  return (
    <ul>
      <li>Nom communiqué : Million&apos;s</li>
      <li>
        Email : <a href="mailto:delrunko27@gmail.com">delrunko27@gmail.com</a>
      </li>
      <li>WhatsApp : 683 234 454</li>
    </ul>
  )
}

function AvertissementLegal() {
  return (
    <aside className="legal-alert" role="note">
      <strong>Informations restant à compléter avant toute commercialisation</strong>
      <p>
        La forme juridique, l’adresse professionnelle, le numéro d’immatriculation, le directeur
        de publication, les coordonnées détaillées de Cloudflare, la région Supabase, les durées
        de conservation et le droit applicable restent à confirmer par l’exploitant. Ces
        informations doivent être vérifiées selon la législation du pays concerné.
      </p>
    </aside>
  )
}

export function MentionsLegales() {
  return (
    <article className="legal-document">
      <p className="legal-eyebrow">SyGesc · Informations sur l’éditeur</p>
      <h1>Mentions légales</h1>
      <p className="muted">Dernière mise à jour : {DATE_MISE_A_JOUR}</p>
      <AvertissementLegal />

      <section>
        <h2>Éditeur du service</h2>
        <p>Nom communiqué pour l’éditeur de SyGesc : <strong>Million&apos;s</strong>.</p>
        <p>
          La forme juridique, l’adresse du siège ou l’adresse professionnelle et le numéro
          d’immatriculation ne nous ont pas été communiqués.
        </p>
        <CoordonneesEditeur />
      </section>
      <section>
        <h2>Directeur de publication</h2>
        <p>À renseigner par l’éditeur avant la mise en ligne publique.</p>
      </section>
      <section>
        <h2>Hébergement</h2>
        <p>
          Le site SyGesc est hébergé par Cloudflare. Les données d’authentification et scolaires
          sont gérées séparément par Supabase. Le produit Cloudflare utilisé, son adresse de
          contact légale et la région du projet Supabase doivent être confirmés par l’exploitant
          dans ses contrats et sa configuration de déploiement.
        </p>
      </section>
      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          Les éléments de SyGesc sont protégés par les règles applicables en matière de propriété
          intellectuelle. Toute reproduction ou réutilisation non autorisée est interdite, sous
          réserve des droits de tiers et des composants open source utilisés par le service.
        </p>
      </section>
      <section>
        <h2>Données personnelles</h2>
        <p>
          Pour toute question ou demande relative aux données personnelles, contactez l’éditeur
          aux coordonnées ci-dessus. La politique de confidentialité est accessible depuis l’écran
          de connexion. Les droits et modalités applicables dépendent du pays concerné et de la
          situation de l’établissement utilisateur.
        </p>
      </section>
    </article>
  )
}

export function PolitiqueConfidentialite() {
  return (
    <article className="legal-document">
      <p className="legal-eyebrow">SyGesc · Protection des données</p>
      <h1>Politique de confidentialité</h1>
      <p className="muted">Dernière mise à jour : {DATE_MISE_A_JOUR}</p>
      <AvertissementLegal />

      <section>
        <h2>1. Qui est responsable des données ?</h2>
        <p>
          Le responsable du traitement est l’exploitant de SyGesc, identifié sous le nom communiqué
          Million&apos;s. Sa forme juridique et son adresse professionnelle restent à confirmer.
          Pour le contacter, utilisez les coordonnées ci-dessous.
        </p>
      </section>
      <section>
        <h2>2. Quelles données sont utilisées ?</h2>
        <ul>
          <li>Compte enseignant : nom, adresse électronique, téléphone facultatif et statut du compte.</li>
          <li>
            Gestion scolaire : noms, coordonnées et logos des établissements, campus, classes,
            matricules, noms d’élèves, champs personnalisés, présences, évaluations et notes saisis
            par l’enseignant.
          </li>
          <li>
            Assistant : compteurs d’utilisation, journal des actions demandées puis confirmées,
            et phrases transmises volontairement à l’administration pour améliorer le dictionnaire.
          </li>
          <li>
            Préférences locales : thème choisi et identifiants des dernières classes ouvertes.
            La session de connexion est gérée par le fournisseur d’authentification.
          </li>
        </ul>
        <p>
          Les conversations ordinaires avec l’assistant ne sont pas enregistrées dans l’historique
          de l’application. Une phrase signalée volontairement et les détails d’une modification
          confirmée sont, eux, enregistrés dans les fonctions prévues à cet effet.
        </p>
      </section>
      <section>
        <h2>3. Pourquoi et sur quelle base ?</h2>
        <p>
          Les données servent à fournir la gestion des classes, des présences et des notes, à
          sécuriser les comptes, à administrer les quotas de l’assistant et à conserver la trace
          des modifications confirmées. La base juridique applicable dépend du contexte de
          l’établissement et doit être déterminée par l’exploitant et l’établissement utilisateur.
        </p>
      </section>
      <section>
        <h2>4. Élèves mineurs et champs personnalisés</h2>
        <p>
          L’enseignant ou l’établissement doit être autorisé à saisir les informations des élèves.
          Les champs personnalisés ne doivent contenir que des renseignements nécessaires à la
          scolarité. Évitez les données sensibles ou médicales qui ne sont pas indispensables et
          informez les familles conformément aux règles applicables.
        </p>
      </section>
      <section>
        <h2>5. Qui peut accéder aux informations ?</h2>
        <p>
          Les données scolaires sont accessibles à l’enseignant propriétaire du compte, selon les
          contrôles d’accès de la base. L’administration de SyGesc gère les comptes et les réglages
          de l’assistant, mais l’interface d’administration n’affiche pas les élèves, leurs notes
          ni leurs présences. Le fournisseur d’hébergement et d’authentification Supabase traite
          les données nécessaires au fonctionnement du service. La région du projet et les
          éventuels transferts doivent être vérifiés et indiqués par l’exploitant avant lancement.
        </p>
        <p>Les données ne sont pas vendues et l’application n’affiche pas de publicité ciblée.</p>
      </section>
      <section>
        <h2>6. Conservation et sécurité</h2>
        <p>
          Les données restent dans le projet Supabase configuré pour le service. Les durées de
          conservation et de sauvegarde dépendent de la configuration de ce projet et de la
          politique de l’établissement ; elles doivent être fixées et publiées par l’exploitant.
          Des règles d’accès par compte, l’authentification et des contrôles côté base protègent
          les données. Aucun service en ligne ne peut toutefois garantir un risque nul.
        </p>
      </section>
      <section>
        <h2>7. Stockage local et mode hors connexion</h2>
        <p>
          Le navigateur conserve la préférence de thème, les dernières classes ouvertes et la
          session gérée par Supabase. L’application installable met en cache uniquement ses
          fichiers publics (interface, scripts, styles, logo et manifeste) pour charger sa coque
          hors connexion. Les dossiers d’élèves, les notes, les présences et les réponses de
          l’API ne sont pas mis en cache par le service worker ; les actions qui nécessitent la
          base ne sont donc pas disponibles hors connexion.
        </p>
      </section>
      <section>
        <h2>8. Vos demandes et contact</h2>
        <p>
          Pour demander l’accès, la rectification ou la suppression des données, ou exercer
          d’autres droits prévus par la loi applicable, contactez Million&apos;s et, si nécessaire,
          l’établissement responsable de la collecte. Les coordonnées sont indiquées ci-dessous.
          Une réclamation peut être adressée à l’autorité de protection des données compétente
          selon votre pays.
        </p>
        <CoordonneesEditeur />
      </section>
    </article>
  )
}

export function ConditionsUtilisation() {
  return (
    <article className="legal-document">
      <p className="legal-eyebrow">SyGesc · Conditions du service</p>
      <h1>Conditions d’utilisation</h1>
      <p className="muted">Dernière mise à jour : {DATE_MISE_A_JOUR}</p>
      <AvertissementLegal />

      <section>
        <h2>1. Objet et acceptation</h2>
        <p>
          SyGesc est un outil de gestion scolaire destiné aux enseignants et établissements.
          En créant un compte ou en utilisant le service, l’utilisateur accepte ces conditions et
          la politique de confidentialité. L’accès peut être soumis à la validation d’un compte
          enseignant par l’administration.
        </p>
      </section>
      <section>
        <h2>2. Compte et sécurité</h2>
        <p>
          L’utilisateur fournit des informations exactes, protège ses identifiants et signale
          toute utilisation non autorisée. Un compte est personnel et ne doit pas être partagé.
          L’accès peut être suspendu en cas d’utilisation abusive, de risque pour la sécurité
          ou de violation de ces conditions.
        </p>
      </section>
      <section>
        <h2>3. Données scolaires et responsabilité</h2>
        <p>
          L’utilisateur doit disposer des autorisations nécessaires pour ajouter les données
          d’élèves, limiter leur collecte au nécessaire et respecter les obligations applicables
          aux mineurs. Il reste responsable de l’exactitude des informations, des présences, des
          notes et des exports qu’il saisit ou utilise.
        </p>
      </section>
      <section>
        <h2>4. Assistant et modifications</h2>
        <p>
          Les réponses de l’assistant reposent sur les informations disponibles dans la classe
          sélectionnée et peuvent être incomplètes. Toute modification préparée par l’assistant
          doit être vérifiée et confirmée par l’utilisateur. L’outil ne remplace ni le jugement
          professionnel de l’enseignant ni les dossiers officiels de l’établissement.
        </p>
      </section>
      <section>
        <h2>5. Disponibilité et sauvegardes</h2>
        <p>
          Le service dépend notamment de la connexion Internet et du fournisseur Supabase. Une
          interruption ou une indisponibilité temporaire est possible. L’utilisateur et son
          établissement doivent conserver les sauvegardes nécessaires et vérifier les exports ;
          l’installation PWA ne rend pas les données scolaires disponibles hors connexion.
        </p>
      </section>
      <section>
        <h2>6. Utilisation autorisée et propriété</h2>
        <p>
          Il est interdit de tenter d’accéder aux données d’un autre compte, de perturber le
          service ou de l’utiliser à des fins illégales. Les contenus saisis restent sous la
          responsabilité de leur utilisateur. Les droits sur l’application SyGesc appartiennent
          à son exploitant, sous réserve des éléments appartenant à des tiers.
        </p>
      </section>
      <section>
        <h2>7. Évolution des conditions et contact</h2>
        <p>
          Ces conditions peuvent évoluer avec le service ou les exigences légales. La version et
          la date de mise à jour sont indiquées en haut de page. Pour toute question, contactez
          l’exploitant Million&apos;s aux coordonnées ci-dessous. Le droit applicable et le règlement
          des litiges doivent être précisés par l’exploitant avant la commercialisation.
        </p>
        <CoordonneesEditeur />
      </section>
    </article>
  )
}
