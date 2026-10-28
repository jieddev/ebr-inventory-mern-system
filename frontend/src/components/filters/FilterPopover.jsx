import { useId, useRef, useState } from 'react'
import Button from '../ui/Button'
import { useClickOutside } from '../../hooks/useClickOutside'
import filterIcon from '../../assets/icons/filter.svg'
import './FilterDropdown.css'

// The "Filter" button and its dropdown, without the sections. Changes are a draft until
// "Show results"; Esc, Cancel or clicking outside drops them.
//   value / empty: the applied filters and the "nothing selected" filters.
//   countOf(filters): how many filters are on, for the button badge and the footer.
//   onOpen(): called on every open, e.g. to fetch fresh counts.
//   children({ draft, set }): the sections; set(changes) updates the draft.
//   align: 'end' opens leftward from the button, 'start' rightward (for a button at the left edge).
export default function FilterPopover({ value, empty, countOf, onApply, onOpen, align = 'end', children }) {
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const popoverId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(value)

  const activeCount = countOf(value)
  const draftCount = countOf(draft)

  function open() {
    setDraft(value)
    setIsOpen(true)
    onOpen?.()
  }

  function close() {
    setIsOpen(false)
  }

  useClickOutside(rootRef, isOpen, close)

  function handleKeyDown(event) {
    if (event.key !== 'Escape' || !isOpen) return
    // Stop here so an open side panel doesn't also close.
    event.stopPropagation()
    close()
    triggerRef.current?.focus()
  }

  function apply() {
    onApply(draft)
    close()
  }

  const set = (changes) => setDraft((d) => ({ ...d, ...changes }))

  return (
    <div className="filter-dropdown" ref={rootRef} onKeyDown={handleKeyDown}>
      <Button
        ref={triggerRef}
        variant="secondary"
        onClick={() => (isOpen ? close() : open())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={popoverId}
      >
        <img src={filterIcon} alt="" />
        Filter
        {activeCount > 0 && <span className="filter-count">{activeCount}</span>}
      </Button>

      {isOpen && (
        <div id={popoverId} className={`filter-popover filter-popover-${align}`} role="dialog" aria-label="Filters">
          <div className="filter-body">{children({ draft, set, idPrefix: popoverId })}</div>

          <footer className="filter-footer">
            <span className="filter-selected">{draftCount ? `${draftCount} selected` : 'No filters'}</span>
            <Button variant="ghost" size="sm" onClick={() => setDraft(empty)} disabled={!draftCount}>
              Clear all
            </Button>
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" onClick={apply}>
              Show results
            </Button>
          </footer>
        </div>
      )}
    </div>
  )
}
