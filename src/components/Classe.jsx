import { useState } from 'react'
import Eleves from './Eleves.jsx'
import Matieres from './Matieres.jsx'
import Presences from './Presences.jsx'
import Notes from './Notes.jsx'
import Resultats from './Resultats.jsx'

const ONGLETS = [
  ['eleves', 'Élèves'],
  ['matieres', 'Matières'],
  ['presences', 'Présences'],
  ['notes', 'Notes'],
  ['resultats', 'Résultats'],
]

export default function Classe({ classe, enseignantNom, roleAcces = 'enseignant' }) {
  const [onglet, setOnglet] = useState('eleves')
  return (
    <>
      <div className="entete-page">
        <h1>{classe.nom}</h1>
        <p className="muted">Année scolaire {classe.annee_scolaire}</p>
      </div>
      <div className="tabs">
        {ONGLETS.map(([id, label]) => (
          <button key={id} type="button"
            className={onglet === id ? 'tab actif' : 'tab'}
            onClick={() => setOnglet(id)}>{label}</button>
        ))}
      </div>
      {onglet === 'eleves' && <Eleves classe={classe} />}
      {onglet === 'matieres' && <Matieres classe={classe} />}
      {onglet === 'presences' && <Presences classe={classe} />}
      {onglet === 'notes' && <Notes classe={classe} />}
      {onglet === 'resultats' && <Resultats classe={classe} enseignantNom={enseignantNom} roleAcces={roleAcces} />}
    </>
  )
}