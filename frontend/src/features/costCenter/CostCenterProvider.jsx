import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { setRequestCostCenter } from '../../api/client'
import { DEFAULT_COST_CENTER, isCostCenter, userCostCenters } from '../../utils/costCenters'
import { useAuth } from '../auth/useAuth'
import { CostCenterContext } from './CostCenterContext'

// The last choice, per PC.
const STORAGE_KEY = 'ebr.costCenter'

function loadChoice() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isCostCenter(saved) ? saved : DEFAULT_COST_CENTER
  } catch {
    return DEFAULT_COST_CENTER
  }
}

// The cost center whose data the pages show. Admins switch between all of them in the sidebar;
// warehouse users and encoders between the ones assigned to them (the server enforces it too).
// allowed: the cost centers the user may pick (and transfer stock between).
export default function CostCenterProvider({ children }) {
  const { user } = useAuth()
  const allowedKey = userCostCenters(user).join()
  const allowed = useMemo(() => (allowedKey ? allowedKey.split(',') : []), [allowedKey])
  const canSwitch = allowed.length > 1
  const [choice, setChoice] = useState(loadChoice)
  // A saved choice the user no longer has access to falls back to their first cost center.
  const costCenter = allowed.includes(choice) ? choice : (allowed[0] ?? null)

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

  const value = useMemo(
    () => ({ costCenter, allowed, canSwitch, setCostCenter }),
    [costCenter, allowed, canSwitch, setCostCenter],
  )

  return <CostCenterContext.Provider value={value}>{children}</CostCenterContext.Provider>
}
