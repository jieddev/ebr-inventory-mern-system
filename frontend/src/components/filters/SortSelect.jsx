import { useId } from 'react'
import sortIcon from '../../assets/icons/sort.svg'
import chevronIcon from '../../assets/icons/chevron-down-sm.svg'
import './SortSelect.css'

// "Sort: …" dropdown for a list toolbar. options: [{ value, label }]; onChange gets the value.
export default function SortSelect({ options, value, onChange }) {
  const id = useId()
  return (
    <div className="sort-select">
      <img src={sortIcon} alt="" width="18" height="18" aria-hidden="true" />
      <label htmlFor={id} className="sort-select-label">
        Sort
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <img className="sort-select-chevron" src={chevronIcon} alt="" width="16" height="16" aria-hidden="true" />
    </div>
  )
}
