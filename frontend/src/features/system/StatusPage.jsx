import { useEffect, useState } from 'react'
import { getHealth } from '../../api/health'
import './StatusPage.css'

function StatusRow({ label, ok, detail }) {
  return (
    <li className="status-row">
      <span className={`status-dot ${ok ? 'is-ok' : 'is-down'}`} />
      <span className="status-label">{label}</span>
      <span className="status-detail">{detail}</span>
    </li>
  )
}

export default function StatusPage() {
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="status-page">
      <section className="status-card">
        <h1>EBR Inventory System</h1>
        <p className="status-subtitle">Development status</p>

        {!health && !error && <p>Checking…</p>}

        {(health || error) && (
          <ul className="status-list">
            <StatusRow label="API" ok={!!health} detail={health ? 'connected' : error} />
            <StatusRow
              label="Database"
              ok={health?.db === 'connected'}
              detail={health ? health.db : 'unknown'}
            />
          </ul>
        )}
      </section>
    </main>
  )
}
