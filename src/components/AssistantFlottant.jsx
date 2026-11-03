import { useState } from 'react'
import Chatbot from './Chatbot.jsx'

export default function AssistantFlottant({ classes, classeCourante }) {
  const [ouvert, setOuvert] = useState(false)
  const [classeSelectionnee, setClasseSelectionnee] = useState('')
  const classeActive = classes.find((classe) => classe.id === classeCourante)
  const classeChoisie = classeActive
    || classes.find((classe) => classe.id === classeSelectionnee)
    || classes[0]

  return (
    <div className="assistant-flottant no-print">
      {ouvert && (
        <section className="assistant-panneau" role="dialog" aria-label="Assistant">
          <div className="assistant-panneau-entete">
            <h2>Assistant</h2>
            <button type="button" className="assistant-fermer" onClick={() => setOuvert(false)}
              aria-label="Fermer l’assistant">×</button>
          </div>
          {classes.length === 0 ? (
            <p className="muted">Crée une classe et ajoute des élèves pour utiliser l’assistant.</p>
          ) : (
            <>
              {classes.length > 1 && (
                <label className="assistant-selecteur">
                  Classe
                  <select id="assistant-classe" className="input" value={classeChoisie.id}
                    onChange={(e) => setClasseSelectionnee(e.target.value)}>
                    {classes.map((classe) => (
                      <option key={classe.id} value={classe.id}>{classe.libelle}</option>
                    ))}
                  </select>
                </label>
              )}
              {classeChoisie && <Chatbot key={classeChoisie.id} classe={classeChoisie} />}
            </>
          )}
        </section>
      )}
      <button type="button" className="assistant-bouton" onClick={() => setOuvert((valeur) => !valeur)}
        aria-label={ouvert ? 'Fermer l’assistant' : 'Ouvrir l’assistant'}
        aria-expanded={ouvert}>
        {ouvert ? (
          <span aria-hidden="true">×</span>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M4.5 5.5h15v11h-9l-5 3v-14Z" />
            <path d="M8 9.5h8M8 13h5" />
          </svg>
        )}
      </button>
    </div>
  )
}
