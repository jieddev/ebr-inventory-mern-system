import { useCopy } from '../../hooks/useCopy'
import './CopyButton.css'

// The text itself, as a button: clicking it copies `text` and shows "Copied" for a moment.
// className styles the text (font, colour) as it looks elsewhere.
export default function CopyText({ text, className = '' }) {
  const { isCopied, copy } = useCopy()

  return (
    <button
      type="button"
      className={`copy-text ${className}`}
      onClick={(event) => {
        // Don't also trigger a clickable row or group around it.
        event.stopPropagation()
        copy(text)
      }}
      aria-label={`Copy ${text}`}
      title={isCopied ? 'Copied' : 'Click to copy'}
    >
      {text}
      <span className="copy-btn-tip" role="status">
        {isCopied ? 'Copied' : ''}
      </span>
    </button>
  )
}
