import copyIcon from '../../assets/icons/copy.svg'
import checkIcon from '../../assets/icons/check.svg'
import { useCopy } from '../../hooks/useCopy'
import './CopyButton.css'

// Small icon button that copies `text`. It turns into a check with "Copied" for a moment.
export default function CopyButton({ text, label = `Copy ${text}` }) {
  const { isCopied, copy } = useCopy()

  return (
    <button
      type="button"
      className={`copy-btn ${isCopied ? 'is-copied' : ''}`}
      onClick={() => copy(text)}
      aria-label={label}
      title={isCopied ? 'Copied' : 'Copy'}
    >
      <img src={isCopied ? checkIcon : copyIcon} alt="" width="14" height="14" />
      <span className="copy-btn-tip" role="status">
        {isCopied ? 'Copied' : ''}
      </span>
    </button>
  )
}
