import { useId, useRef, useState } from 'react'
import chevronIcon from '../../assets/icons/chevron-down.svg'
import '../../components/ui/TextField.css'
import './TypeDesignPicker.css'

// Type / Design field: pick a known type or type a new one. Shows every type when the
// field is empty or already holds one, otherwise only the types that contain the text.
export default function TypeDesignPicker({ value, onChange, types, label = 'Type / Design', placeholder = 'Select type' }) {
  const id = useId()
  const listId = `${id}-list`
  const inputRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const query = value.trim().toLowerCase()
  const isKnownType = types.some((type) => type.toLowerCase() === query)
  const options = !query || isKnownType ? types : types.filter((type) => type.toLowerCase().includes(query))
  const showList = isOpen && options.length > 0

  function open() {
    setIsOpen(true)
    setActiveIndex(options.findIndex((type) => type.toLowerCase() === query))
  }

  function choose(type) {
    onChange(type)
    setIsOpen(false)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!showList) return open()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + step + options.length) % options.length)
    } else if (event.key === 'Enter' && showList && options[activeIndex]) {
      event.preventDefault()
      choose(options[activeIndex])
    } else if (event.key === 'Escape' && showList) {
      // Close the list, not the whole panel.
      event.stopPropagation()
      setIsOpen(false)
    }
  }

  return (
    <div className="field type-picker">
      <label className="field-label" htmlFor={id}>
        {label}
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
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
            setActiveIndex(0)
          }}
          onClick={open}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="type-picker-toggle"
          tabIndex={-1}
          aria-label={showList ? 'Hide types' : 'Show types'}
          // mousedown, so the input keeps focus and its blur doesn't close the list first
          onMouseDown={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
            if (showList) setIsOpen(false)
            else open()
          }}
        >
          <img src={chevronIcon} alt="" width="20" height="20" />
        </button>

        {showList && (
          <ul id={listId} className="type-picker-list" role="listbox">
            {options.map((type, index) => (
              <li
                key={type}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={type.toLowerCase() === query}
                className={index === activeIndex ? 'is-active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(type)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {type}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
