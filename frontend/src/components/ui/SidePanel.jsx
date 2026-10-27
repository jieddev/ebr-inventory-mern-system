import { useEffect, useId } from 'react'
import closeIcon from '../../assets/icons/close.svg'
import './SidePanel.css'

// Right-hand panel that sits beside the page content (it doesn't cover it).
// Esc closes it.
export default function SidePanel({ title, subtitle, onClose, footer, children, as: Body = 'div', bodyProps }) {
  const titleId = useId()

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <aside className="side-panel" aria-labelledby={titleId}>
      <header className="side-panel-header">
        <div className="side-panel-titles">
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="side-panel-close" onClick={onClose} aria-label="Close panel">
          <img src={closeIcon} alt="" width="20" height="20" />
        </button>
      </header>

      <Body className="side-panel-content" {...bodyProps}>
        <div className="side-panel-body">{children}</div>
        {footer && <footer className="side-panel-footer">{footer}</footer>}
      </Body>
    </aside>
  )
}
