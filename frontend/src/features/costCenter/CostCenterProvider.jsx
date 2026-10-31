import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { setRequestCostCenter } from '../../api/client'
import { DEFAULT_COST_CENTER, isCostCenter } from '../../utils/costCenters'
import { useAuth } from '../auth/useAuth'
import { CostCenterContext } from './CostCenterContext'

// The admin's last choice, per PC.
const STORAGE_KEY = 'ebr.costCenter'

function loadChoice() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isCostCenter(saved) ? saved : DEFAULT_COST_CENTER
  } catch {
    return DEFAULT_COST_CENTER
  }
}

// The cost center whose data the pages show. Warehouse users and encoders always work in their
// own (the server enforces it too); admins switch between all of them in the sidebar.
export default function CostCenterProvider({ children }) {
  const { user } = useAuth()
  const canSwitch = user.role === 'admin'
  const [choice, setChoice] = useState(loadChoice)
  const costCenter = canSwitch ? choice : user.costCenter

  // A layout effect, so requests the pages send from their own effects already carry it.
  useLayoutEffect(() => {
    setRequestCostCenter(costCenter)
  }, [costCenter])

  const setCostCenter = useCallback((value) => {
    setChoice(value)
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // Storage blocked: the choice lasts until the page reloads.
    }
  }, [])

  const value = useMemo(() => ({ costCenter, canSwitch, setCostCenter }), [costCenter, canSwitch, setCostCenter])

  return <CostCenterContext.Provider value={value}>{children}</CostCenterContext.Provider>
}
