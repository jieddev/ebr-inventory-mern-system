import { useId } from 'react'
import { PERMISSIONS } from '../../utils/permissions'
import './PermissionChecklist.css'

// What a warehouse user or encoder may do. value: the ticked permission keys.
export default function PermissionChecklist({ value, onChange, hint }) {
  const labelId = useId()

  function toggle(permission) {
    onChange(value.includes(permission) ? value.filter((p) => p !== permission) : [...value, permission])
  }

  return (
    <div className="field" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="field-label">
        Permissions
      </span>
      <div className="permission-list">
        {PERMISSIONS.map((p) => (
          <label key={p.value} className="permission-option">
            <input type="checkbox" checked={value.includes(p.value)} onChange={() => toggle(p.value)} />
            <span>
              {p.label}
              {p.hint && <span className="permission-hint">{p.hint}</span>}
            </span>
          </label>
        ))}
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
