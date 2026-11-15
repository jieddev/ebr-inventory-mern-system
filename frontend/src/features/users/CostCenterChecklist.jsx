import { useId } from 'react'
import { COST_CENTERS } from '../../utils/costCenters'
import './PermissionChecklist.css'

// The cost centers a warehouse user or encoder may work in. value: the ticked cost centers.
// With more than one they can switch between them in the sidebar and make stock transfers.
export default function CostCenterChecklist({ value, onChange, error }) {
  const labelId = useId()
  const helpId = useId()

  function toggle(costCenter) {
    onChange(value.includes(costCenter) ? value.filter((c) => c !== costCenter) : [...value, costCenter])
  }

  return (
    <div className={`field ${error ? 'has-error' : ''}`} role="group" aria-labelledby={labelId} aria-describedby={helpId}>
      <span id={labelId} className="field-label">
        Cost centers
        <span className="field-required"> *</span>
      </span>
      <div className="permission-list">
        {COST_CENTERS.map((c) => (
          <label key={c.value} className="permission-option">
            <input type="checkbox" checked={value.includes(c.value)} onChange={() => toggle(c.value)} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      <p id={helpId} className={error ? 'field-error' : 'field-hint'}>
        {error ||
          "They'll only see these cost centers' items, transactions and reports. With two or more they can switch between them and make stock transfers."}
      </p>
    </div>
  )
}
