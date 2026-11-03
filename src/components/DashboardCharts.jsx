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