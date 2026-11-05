import { useEffect, useId, useState } from 'react'
import TextField from '../../components/ui/TextField'
import { getItemCategories } from '../../api/items'
import chevronIcon from '../../assets/icons/chevron-down.svg'

// The Category, Item description, Brand and Balance forwarded fields of Add Item and
// Edit Item. Loads its own category choices.
export default function ItemFields({ form, errors, onChange, categoryRef, codeRef, balanceHint }) {
  const categoryId = useId()
  const [categories, setCategories] = useState([])

  useEffect(() => {
    getItemCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  return (
    <>
      <div className={`field ${errors.category ? 'has-error' : ''}`}>
        <label className="field-label" htmlFor={categoryId}>
          Category
          <span className="field-required"> *</span>
        </label>
        <div className="field-control">
          <select
            ref={categoryRef}
            id={categoryId}
            className="field-input field-select"
            required
            aria-invalid={!!errors.category}
            aria-describedby={errors.category ? `${categoryId}-error` : undefined}
            value={form.category}
            onChange={(e) => onChange('category', e.target.value)}
          >
            <option value="" disabled>
              Select category
            </option>
            {/* Keeps an item's current category selectable while the list loads. */}
            {form.category && !categories.includes(form.category) && <option value={form.category}>{form.category}</option>}
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <div className="field-adornment field-adornment-icon" aria-hidden="true">
            <img src={chevronIcon} alt="" width="20" height="20" />
          </div>
        </div>
        {errors.category && (
          <p id={`${categoryId}-error`} className="field-error">
            {errors.category}
          </p>
        )}
      </div>

      <TextField
        ref={codeRef}
        label="Item description"
        required
        placeholder="e.g. 185 R14 DUNLOP VANO1"
        autoComplete="off"
        value={form.code}
        onChange={(e) => onChange('code', e.target.value)}
        error={errors.code}
      />

      <TextField
        label="Brand name"
        placeholder="e.g. DUNLOP"
        autoComplete="off"
        value={form.brand}
        onChange={(e) => onChange('brand', e.target.value)}
      />

      <TextField
        label="Balance forwarded"
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        placeholder="0"
        value={form.balanceForwarded}
        onChange={(e) => onChange('balanceForwarded', e.target.value)}
        error={errors.balanceForwarded}
        hint={balanceHint}
      />
    </>
  )
}
