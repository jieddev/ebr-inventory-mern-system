import { useEffect, useRef } from 'react'
import { getRequestCostCenter } from '../api/client'

const EVENTS_URL = `${import.meta.env.VITE_API_URL || '/api'}/events`

// One connection per tab, shared by every component that listens. Browsers allow only
// about 6 open connections per site over HTTP/1.1, so each listener must not open its own.
const listeners = new Set()
let source = null

function connect() {
  source = new EventSource(EVENTS_URL, { withCredentials: true })
  let hasConnected = false

  source.onopen = () => {
    // Changes may have been missed while the connection was down.
    if (hasConnected) listeners.forEach((listener) => listener({ reconnected: true }))
    hasConnected = true
  }
  source.addEventListener('item-changed', (event) => {
    const change = JSON.parse(event.data)
    // Admins hear about every cost center; only the one on screen matters.
    if (change.costCenter && change.costCenter !== getRequestCostCenter()) return
    listeners.forEach((listener) => listener(change))
  })
}

// Listens to the server's change stream (Server-Sent Events).
// Calls onChange({ itemId }) when an item or its transactions change on any PC, and
// onChange({ reconnected: true }) after a dropped connection comes back.
// The browser reconnects by itself.
export function useLiveUpdates(onChange) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    const listener = (change) => onChangeRef.current(change)
    listeners.add(listener)
    // A closed source means the server refused it (e.g. the session expired); start over.
    if (!source || source.readyState === EventSource.CLOSED) connect()

    return () => {
      listeners.delete(listener)
      if (!listeners.size) {
        source.close()
        source = null
      }
    }
  }, [])
}
