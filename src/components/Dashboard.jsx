import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import Sidebar from './Sidebar.jsx'
import Accueil from './Accueil.jsx'
import EtablissementPage from './EtablissementPage.jsx'
import Classe from './Classe.jsx'
import AssistantFlottant from './AssistantFlottant.jsx'

function lireRecents(cle) {
  try {
    const v = JSON.parse(localStorage.getItem(cle) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

export default function Dashboard({ nom, userId, roleAcces = 'enseignant' }) {
  const cleRecents = `classes_recentes_${userId}`
  const [arbre, setArbre] = useState([])
  const [logos, setLogos] = useState({})
  const [vue, setVue] = useState({ type: 'accueil' })
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [recents, setRecents] = useState(() => lireRecents(cleRecents))
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)

  const charger = useCallback(async () => {
    const { data, error } = await supabase
      .from('etablissements')
      .select('id, nom, adresse, telephone, email, site_web, logo_path, campus(id, nom, ville, classes(id, nom, annee_scolaire, eleves(count)))')
      .order('created_at')
    if (error) { setErreur(error.message); setChargement(false); return }
    const chemins = data.map((e) => e.logo_path).filter(Boolean)
    let logoUrls = {}
    let erreurLogo = ''
    if (chemins.length > 0) {
      const r = await supabase.storage.from('logos').createSignedUrls(chemins, 3600)
      if (r.error) erreurLogo = `Impossible de charger les logos : ${r.error.message}`
      else if (!r.data) erreurLogo = 'Impossible de charger les logos : réponse du stockage vide.'
      else logoUrls = Object.fromEntries(r.data.filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]))
    }
    setLogos(logoUrls)
    setArbre(data.map((etab) => ({ ...etab, logo_url: logoUrls[etab.logo_path] || '' })))
    setErreur(erreurLogo)
    setChargement(false)
  }, [])

  useEffect(() => { if (vue.type === 'accueil') charger() }, [vue.type, charger])

  function aller(v) {
    setVue(v)
    setMenuOuvert(false)
    window.scrollTo(0, 0)
    if (v.type === 'classe') {
      const suivant = [v.id, ...recents.filter((x) => x !== v.id)].slice(0, 3)
      setRecents(suivant)
      try { localStorage.setItem(cleRecents, JSON.stringify(suivant)) } catch { /* ignoré */ }
    }
  }

  const etabCourant = vue.type === 'etab' ? arbre.find((e) => e.id === vue.id) : null
  let classeCourante = null
  if (vue.type === 'classe') {
    for (const e of arbre) {
      for (const c of e.campus) {
        const cl = c.classes.find((x) => x.id === vue.id)
        if (cl) classeCourante = { ...cl, campusNom: c.nom, campusVille: c.ville, etab: e }
      }
    }
  }
  const etabActif = etabCourant || (classeCourante ? classeCourante.etab : null)
  const classesAssistant = arbre.flatMap((etablissement) =>
    etablissement.campus.flatMap((campus) =>
      campus.classes.map((classe) => ({
        ...classe,
        libelle: `${etablissement.nom} · ${campus.nom} · ${classe.nom}`,
      })),
    ),
  )

  let contenu
  if (etabCourant) {
    contenu = (
      <EtablissementPage key={etabCourant.id} etab={etabCourant} onChange={charger}
        onSupprime={() => aller({ type: 'accueil' })} onAller={aller} />
    )
  } else if (classeCourante) {
    contenu = (
      <>
        <nav className="fil" aria-label="Fil d’Ariane">
          <button type="button" onClick={() => aller({ type: 'etab', id: classeCourante.etab.id })}>
            {classeCourante.etab.nom}
          </button>
          <span aria-hidden="true">›</span>
          <span>{classeCourante.campusNom}</span>
          <span aria-hidden="true">›</span>
          <span>{classeCourante.nom}</span>
        </nav>
        <Classe key={classeCourante.id} classe={classeCourante} enseignantNom={nom}
          roleAcces={roleAcces} />
      </>
    )
  } else {
    contenu = (
      <Accueil nom={nom} arbre={arbre} logos={logos} recents={recents}
        chargement={chargement} onAller={aller} onChange={charger} />
    )
  }

  return (
    <div className="shell">
      <button type="button" className="menu-btn no-print" onClick={() => setMenuOuvert(true)}>Menu</button>
      {menuOuvert && <div className="voile" onClick={() => setMenuOuvert(false)} />}
      <Sidebar arbre={arbre} logos={logos} vue={vue} etabActif={etabActif} ouvert={menuOuvert}
        nom={nom} onAller={aller} onFermer={() => setMenuOuvert(false)} />
      <main className="contenu">
        {erreur && <p className="muted">{erreur}</p>}
        {contenu}
      </main>
      <AssistantFlottant classes={classesAssistant} classeCourante={classeCourante?.id} />
    </div>
  )
}