import { useEffect, useId, useRef, useState } from 'react'
import TextField from '../../components/ui/TextField'
import { getItemBrands, getItemCategories } from '../../api/items'
import chevronIcon from '../../assets/icons/chevron-down.svg'

// The select option that switches the Brand name field to typing.
const TYPE_BRAND = '__type__'

// The Category, Item description, Brand and Balance forwarded fields of Add Item and
// Edit Item. Loads its own category and brand choices. codeHint shows under Item description.
export default function ItemFields({ form, errors, onChange, categoryRef, codeRef, balanceHint, codeHint }) {
  const categoryId = useId()
  const brandId = useId()
  const [categories, setCategories] = useState([])
  const [brands, setBrands] = useState(null) // null while loading
  const [isTypingBrand, setIsTypingBrand] = useState(false)
  const brandInputRef = useRef(null)

  useEffect(() => {
    getItemCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
    getItemBrands()
      .then(setBrands)
      .catch(() => setBrands([]))
  }, [])

  // Brands are saved uppercase, so "gulf" picks GULF.
  const brandValue = form.brand.trim().toUpperCase()
  const isListedBrand = !brands || !brandValue || brands.includes(brandValue)
  // A brand that isn't in the list (typed before, or from an import) shows in the text box.
  const showBrandInput = isTypingBrand || !isListedBrand

  function handleBrandSelect(value) {
    if (value === TYPE_BRAND) {
      setIsTypingBrand(true)
      onChange('brand', '')
      // After the text box renders.
      setTimeout(() => brandInputRef.current?.focus())
      return
    }
    setIsTypingBrand(false)
    onChange('brand', value)
  }

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
      {codeHint}

      <div className="field">
        <label className="field-label" htmlFor={brandId}>
          Brand name
        </label>
        <div className="field-control">
          <select
            id={brandId}
            className="field-input field-select"
            value={showBrandInput ? TYPE_BRAND : brandValue}
            onChange={(e) => handleBrandSelect(e.target.value)}
          >
            <option value="">No brand</option>
            {/* Keeps an item's current brand selectable while the list loads. */}
            {!brands && brandValue && <option value={brandValue}>{brandValue}</option>}
            {brands?.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
            <option value={TYPE_BRAND}>Other – type a brand name…</option>
          </select>
          <div className="field-adornment field-adornment-icon" aria-hidden="true">
            <img src={chevronIcon} alt="" width="20" height="20" />
          </div>
        </div>
      </div>

      {showBrandInput && (
        <TextField
          ref={brandInputRef}
          label="New brand name"
          placeholder="e.g. DUNLOP"
          autoComplete="off"
          value={form.brand}
          onChange={(e) => onChange('brand', e.target.value)}
          hint="Saved in capital letters; it's added to the list for the next items."
        />
      )}

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
