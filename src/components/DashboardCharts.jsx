import { Pie, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement)

const opts = { responsive: true, maintainAspectRatio: false }

export function RepartitionMoyennesEnseignant({ lignes }) {
  const classes = [
    { label: '0 – 5', min: 0, max: 5, color: '#ef4444' },
    { label: '5 – 10', min: 5, max: 10, color: '#f97316' },
    { label: '10 – 12', min: 10, max: 12, color: '#eab308' },
    { label: '12 – 14', min: 12, max: 14, color: '#84cc16' },
    { label: '14 – 16', min: 14, max: 16, color: '#22c55e' },
    { label: '16 – 20', min: 16, max: 20.000001, color: '#16a34a' },
  ]
  const notesParEleve = new Map()
  lignes.forEach((ligne) => {
    if (ligne.valeur === null || ligne.valeur === undefined || !ligne.noteMax) return
    const noteSur20 = (ligne.valeur / ligne.noteMax) * 20
    const notes = notesParEleve.get(ligne.eleveId) || []
    notes.push(noteSur20)
    notesParEleve.set(ligne.eleveId, notes)
  })

  const moyennes = [...notesParEleve.values()]
    .map((notes) => notes.reduce((total, note) => total + note, 0) / notes.length)
  const effectifs = classes.map(({ min, max }) =>
    moyennes.filter((moyenne) => moyenne >= min && moyenne < max).length)
  const options = {
    ...opts,
    plugins: {
      ...opts.plugins,
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.y} élève${context.parsed.y === 1 ? '' : 's'}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
        title: { display: true, text: 'Nombre d’élèves' },
      },
    },
  }
  const data = {
    labels: classes.map((tranche) => tranche.label),
    datasets: [{
      label: 'Élèves',
      data: effectifs,
      backgroundColor: classes.map((tranche) => tranche.color),
      borderRadius: 8,
      maxBarThickness: 54,
    }],
  }

  return (
    <section className="card teacher-average-chart">
      <div className="gestion-card-heading">
        <div>
          <p className="gestion-eyebrow">Vue pédagogique</p>
          <h3>Répartition des moyennes</h3>
        </div>
        <span className="gestion-total">{moyennes.length} élève{moyennes.length === 1 ? '' : 's'} avec notes</span>
      </div>
      <p className="gestion-table-footnote">
        Moyennes indicatives sur 20, calculées sur les notes saisies pour la période. Elles ne remplacent pas le bulletin officiel.
      </p>
      {moyennes.length === 0
        ? <p className="gestion-empty">Aucune note saisie pour cette période.</p>
        : <div className="chart-wrap"><Bar data={data} options={options} /></div>}
    </section>
  )
}

export default function DashboardCharts({ matieres, lignes, presences }) {
  // Répartition des présences (toutes séances confondues)
  const presenceData = () => {
    const counts = { present: 0, absent: 0, excuse: 0 }
    presences.forEach((p) => { counts[p.statut] = (counts[p.statut] || 0) + 1 })
    return {
      labels: ['Présent', 'Absent', 'Excusé'],
      datasets: [{
        data: [counts.present, counts.absent, counts.excuse],
        backgroundColor: ['#22c55e', '#ef4444', '#9ca3af'],
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    }
  }

  // Moyenne par matière (moyenne de la classe)
  const matiereData = () => {
    const labels = matieres.map((m) => m.nom)
    const data = matieres.map((m) => {
      const vals = lignes
        .map((l) => l.parMatiere[m.id])
        .filter((v) => v !== null && v !== undefined)
      return vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 0
    })
    return {
      labels,
      datasets: [{
        label: 'Moyenne classe / 20',
        data,
        backgroundColor: '#2563eb',
        borderRadius: 8,
      }],
    }
  }

  // Répartition des moyennes générales (tranches)
  const repartitionData = () => {
    const tranches = { '0-10': 0, '10-12': 0, '12-14': 0, '14-16': 0, '16-20': 0 }
    lignes.forEach((l) => {
      const g = l.general
      if (g === null || g === undefined) return
      if (g < 10) tranches['0-10']++
      else if (g < 12) tranches['10-12']++
      else if (g < 14) tranches['12-14']++
      else if (g < 16) tranches['14-16']++
      else tranches['16-20']++
    })
    return {
      labels: ['0 – 10', '10 – 12', '12 – 14', '14 – 16', '16 – 20'],
      datasets: [{
        data: Object.values(tranches),
        backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'],
        borderWidth: 2,
        borderColor: '#ffffff',
      }],
    }
  }

  return (
    <div className="dashboard-charts">
      <div className="chart-card">
        <h3>Présences sur l’année entière</h3>
        <div className="chart-wrap">
          <Pie data={presenceData()} options={opts} />
        </div>
      </div>
      <div className="chart-card">
        <h3>Moyenne par matière</h3>
        <div className="chart-wrap">
          <Bar data={matiereData()} options={opts} />
        </div>
      </div>
      <div className="chart-card">
        <h3>Répartition des moyennes générales</h3>
        <div className="chart-wrap">
          <Pie data={repartitionData()} options={opts} />
        </div>
      </div>
    </div>
  )
}