import { useEffect, useRef, useState } from 'react'
import copyIcon from '../../assets/icons/copy.svg'
import checkIcon from '../../assets/icons/check.svg'
import './CopyButton.css'

const COPIED_MS = 1500

// navigator.clipboard only works on https or localhost. Other PCs that open the app by its
// LAN address (http://192.168…) get the older copy command instead.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  if (!ok) throw new Error('Copy failed')
}

// Small icon button that copies `text`. It turns into a check with "Copied" for a moment.
export default function CopyButton({ text, label = `Copy ${text}` }) {
  const [isCopied, setIsCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function handleClick() {
    try {
      await copyText(text)
      setIsCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setIsCopied(false), COPIED_MS)
    } catch {
      // Clipboard blocked by the browser; the text can still be selected by hand.
    }
  }

  return (
    <button
      type="button"
      className={`copy-btn ${isCopied ? 'is-copied' : ''}`}
      onClick={handleClick}
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
