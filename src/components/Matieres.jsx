import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const formatNombre = (valeur) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(valeur))

export default function Matieres({ classe }) {
  const [matieres, setMatieres] = useState([])
  const [nom, setNom] = useState('')
  const [coef, setCoef] = useState('1')
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')

  async function charger() {
    const { data, error } = await supabase
      .from('matieres').select('id, nom, coefficient')
      .eq('classe_id', classe.id).order('nom')
    if (error) setErreur(error.message)
    else setMatieres(data)
  }

  useEffect(() => { charger() }, [classe.id])

  async function ajouter(e) {
    e.preventDefault()
    const c = Number(coef.replace(',', '.'))
    if (!(c > 0) || c > 99.99) { setErreur('Coefficient invalide (entre 0,01 et 99,99).'); return }
    const { error } = await supabase.from('matieres').insert({
      classe_id: classe.id, nom: nom.trim(), coefficient: c,
    })
    if (error) {
      setErreur(error.code === '23505' ? 'Cette matière existe déjà dans la classe.' : error.message)
    } else {
      setErreur('')
      setInfo(`${nom.trim()} a été ajoutée à la classe.`)
      setNom('')
      setCoef('1')
      await charger()
    }
  }

  async function supprimer(matiere) {
    if (!window.confirm(`Supprimer ${matiere.nom}, ses séances, présences et notes ?`)) return
    const { error } = await supabase.from('matieres').delete().eq('id', matiere.id)
    if (error) setErreur(error.message)
    else {
      setErreur('')
      setInfo(`${matiere.nom} a été supprimée.`)
      await charger()
    }
  }

  const totalCoefficients = matieres.reduce((total, matiere) => total + Number(matiere.coefficient), 0)

  return (
    <div className="gestion-page">
      {erreur && <p className="assistant-notice assistant-notice-erreur" role="alert">{erreur}</p>}
      {info && <p className="assistant-notice" role="status">{info}</p>}
      <header className="gestion-heading">
        <div>
          <p className="gestion-eyebrow">Programme de la classe</p>
          <h2>Matières</h2>
          <p className="muted">Configure les matières et leur poids dans le calcul des résultats.</p>
        </div>
        <div className="gestion-indicateurs">
          <span className="gestion-total"><strong>{matieres.length}</strong> matière{matieres.length === 1 ? '' : 's'}</span>
          <span className="gestion-total"><strong>{formatNombre(totalCoefficients)}</strong> coefficient total</span>
        </div>
      </header>

      <section className="card gestion-card">
        <div className="gestion-card-heading">
          <div>
            <p className="gestion-eyebrow">Programme scolaire</p>
            <h3>Ajouter une matière</h3>
          </div>
        </div>
        <form onSubmit={ajouter} className="gestion-form">
          <label>
            Nom de la matière
            <input className="input" placeholder="Ex. Mathématiques" value={nom}
              onChange={(e) => setNom(e.target.value)} required maxLength={100} />
          </label>
          <label className="gestion-coef-input">
            Coefficient
            <input className="input" placeholder="1" value={coef} inputMode="decimal"
              onChange={(e) => setCoef(e.target.value)} required />
          </label>
          <button type="submit" className="btn btn-primary">Ajouter la matière</button>
        </form>
        <p className="gestion-table-footnote">Le coefficient sert à pondérer les moyennes et les résultats de la classe.</p>
      </section>

      <section className="card gestion-card">
        <div className="gestion-card-heading">
          <div>
            <p className="gestion-eyebrow">Année scolaire {classe.annee_scolaire}</p>
            <h3>Programme de la classe</h3>
          </div>
        </div>
        {matieres.length === 0
          ? <p className="gestion-empty">Aucune matière n’est encore configurée pour cette classe.</p>
          : (
            <div className="gestion-table-scroll">
              <table className="apercu gestion-table">
                <thead>
                  <tr><th scope="col">N°</th><th scope="col">Matière</th><th scope="col">Coefficient</th><th scope="col">Actions</th></tr>
                </thead>
                <tbody>
                  {matieres.map((matiere, index) => (
                    <tr key={matiere.id}>
                      <td className="gestion-row-number">{String(index + 1).padStart(2, '0')}</td>
                      <th scope="row">{matiere.nom}</th>
                      <td><span className="gestion-code">× {formatNombre(matiere.coefficient)}</span></td>
                      <td>
                        <button type="button" className="btn btn-danger btn-small"
                          onClick={() => supprimer(matiere)} aria-label={`Supprimer ${matiere.nom}`}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {matieres.length > 0 && <p className="gestion-table-footnote">{matieres.length} matière(s) au programme</p>}
      </section>
    </div>
  )
}
