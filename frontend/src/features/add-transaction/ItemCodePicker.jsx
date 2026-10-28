import { useEffect, useId, useState } from 'react'
import { searchItems } from '../../api/items'
import { formatNumber } from '../../utils/format'
import '../../components/ui/TextField.css'
import './ItemCodePicker.css'

const SEARCH_DELAY_MS = 200

// Type-ahead for item codes. One code can belong to several items (different brand or
// type), so each match shows its brand and type, and the user picks the exact one.
export default function ItemCodePicker({ value, onChange, selected, onSelect, error, hint, inputRef }) {
  const id = useId()
  const listId = `${id}-list`
  // Matches for the last finished search; stale while the user keeps typing.
  const [found, setFound] = useState({ query: '', items: [] })
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const query = value.trim()
  const isSearching = found.query !== query
  const results = query && !selected && !isSearching ? found.items : []

  useEffect(() => {
    if (!query || selected) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchItems(query, { signal: controller.signal })
        .then((items) => {
          setFound({ query, items })
          setActiveIndex(0)
        })
        .catch(() => {
          if (!controller.signal.aborted) setFound({ query, items: [] })
        })
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, selected])

  function choose(item) {
    onSelect(item)
    setIsOpen(false)
  }

  function handleKeyDown(event) {
    if (!isOpen || !results.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[activeIndex])
    } else if (event.key === 'Escape') {
      // Close the list, not the whole panel.
      event.stopPropagation()
      setIsOpen(false)
    }
  }

  const showList = isOpen && !selected && query !== ''
  const describedBy = error ? `${id}-error` : `${id}-hint`

  return (
    <div className={`field item-picker ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        Item code<span className="field-required"> *</span>
      </label>
      <div className="field-control">
        <input
          ref={inputRef}
          id={id}
          className="field-input"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results.length ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          autoComplete="off"
          placeholder="Start typing an item code"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
        />

        {showList && (
          <ul id={listId} className="item-picker-list" role="listbox">
            {results.map((item, index) => (
              <li
                key={item._id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? 'is-active' : ''}
                // mousedown, so the pick happens before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(item)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="item-picker-code">{item.code}</span>
                <span className="item-picker-details">
                  {[item.itemId, item.brand, item.typeDesign].filter(Boolean).join(' · ') || 'No brand or type'}
                </span>
                <span className="item-picker-balance">Bal. {formatNumber(item.balance)}</span>
              </li>
            ))}
            {!results.length && (
              <li className="item-picker-empty" role="presentation">
                {isSearching ? 'Searching…' : 'No items found. Add it with Add Item first.'}
              </li>
            )}
          </ul>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  )
}
