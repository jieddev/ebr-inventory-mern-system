import { useEffect, useState } from 'react'
import { getHealth } from '../../api/health'
import './ClockWarning.css'

// Same limit as the server (backend/src/services/clock.service.js).
const MAX_DRIFT_MS = 2 * 60 * 1000
const RECHECK_MS = 10 * 60 * 1000

const minutes = (ms) => Math.max(1, Math.round(Math.abs(ms) / 60000))

// Warns when a clock is wrong, since every saved date comes from the computers' clocks:
// the server's clock (checked by the server against the database) and this computer's clock
// (checked here against the server, since the browser may run on another PC).
export default function ClockWarning() {
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const sentAt = Date.now()
        const health = await getHealth()
        const receivedAt = Date.now()
        if (cancelled) return

        const serverDrift = health.clock?.ok === false ? health.clock.driftMs : null
        const browserDrift = (sentAt + receivedAt) / 2 - new Date(health.timestamp).getTime()

        if (serverDrift != null) {
          setProblem(`The server computer's clock is off by ${minutes(serverDrift)} min.`)
        } else if (Math.abs(browserDrift) > MAX_DRIFT_MS) {
          setProblem(`This computer's clock is off by ${minutes(browserDrift)} min compared with the server.`)
        } else {
          setProblem(null)
        }
      } catch {
        // Can't reach the server; other parts of the app already report that.
      }
    }

    check()
    const timer = setInterval(check, RECHECK_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (!problem) return null

  return (
    <div className="clock-warning" role="alert">
      <strong>Clock problem.</strong> {problem} Dates on new entries may be wrong. Fix the system date and time.
    </div>
  )
}
