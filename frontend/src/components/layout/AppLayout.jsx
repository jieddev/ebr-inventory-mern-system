import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ActivityToasts from './ActivityToasts'
import AppBar from './AppBar'
import ClockWarning from './ClockWarning'
import Sidebar from './Sidebar'
import { rememberView } from '../../utils/rememberedViews'
import CostCenterProvider from '../../features/costCenter/CostCenterProvider'
import { useCostCenter } from '../../features/costCenter/useCostCenter'
import './AppLayout.css'

export default function AppLayout() {
  const location = useLocation()
  // Phones: the sidebar is a drawer, opened from the app bar's menu button.
  const [isNavOpen, setIsNavOpen] = useState(false)
  const closeNav = useCallback(() => setIsNavOpen(false), [])

  // Each list page's filters, for the links that lead back to it (see Sidebar).
  useEffect(() => {
    rememberView(location.pathname, location.search)
  }, [location.pathname, location.search])

  return (
    <CostCenterProvider>
      <div className="app-layout">
        <AppBar
          isNavOpen={isNavOpen}
          onMenuClick={() => setIsNavOpen((open) => !open)}
          onNavigate={closeNav}
        />
        <ClockWarning />
        <div className="app-body">
          <Sidebar isOpen={isNavOpen} onClose={closeNav} />
          <main className="app-content">
            <CostCenterPage />
          </main>
        </div>
        {/* Live notices. The server only sends each one to the roles allowed to see it. */}
        <ActivityToasts />
      </div>
    </CostCenterProvider>
  )
}

// The current page, started over (and so re-fetched) when an admin switches cost center.
function CostCenterPage() {
  const { costCenter } = useCostCenter()
  return <Outlet key={costCenter} />
}
