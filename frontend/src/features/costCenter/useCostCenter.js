import { useContext } from 'react'
import { CostCenterContext } from './CostCenterContext'

// { costCenter, canSwitch, setCostCenter }
export function useCostCenter() {
  const ctx = useContext(CostCenterContext)
  if (!ctx) throw new Error('useCostCenter must be used inside <CostCenterProvider>')
  return ctx
}
