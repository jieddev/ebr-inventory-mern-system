import { useEffect, useRef, useState } from 'react'
import { getReservationCounts } from '../api/transactions'
import { useCostCenter } from '../features/costCenter/useCostCenter'
import { useLiveUpdates } from './useLiveUpdates'

// Changes that land within this window cause a single re-fetch.
const REFRESH_DELAY_MS = 500

// { pending, overdue } reservations, for the sidebar badge. Re-fetched on every live update,
// which also reaches the tab that made the change. Pass enabled: false for roles that
// can't see reservations; the counts then stay at 0.
export function usePendingReservations({ enabled = true } = {}) {
  const { costCenter } = useCostCenter()
  const [counts, setCounts] = useState({ pending: 0, overdue: 0 })
  const [refreshKey, setRefreshKey] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    getReservationCounts({ signal: controller.signal })
      .then(setCounts)
      .catch(() => {}) // the badge keeps its last numbers; the next change retries
    return () => controller.abort()
  }, [enabled, refreshKey, costCenter])

  useEffect(() => () => clearTimeout(timer.current), [])

  useLiveUpdates(() => {
    if (!enabled) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setRefreshKey((k) => k + 1), REFRESH_DELAY_MS)
  })

  return enabled ? counts : { pending: 0, overdue: 0 }
}
