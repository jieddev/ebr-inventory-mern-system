import { useEffect, useRef, useState } from 'react'

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

// copy(text) puts text on the clipboard; isCopied is true for a moment afterwards.
export function useCopy() {
  const [isCopied, setIsCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy(text) {
    try {
      await copyText(text)
      setIsCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setIsCopied(false), COPIED_MS)
    } catch {
      // Clipboard blocked by the browser; the text can still be selected by hand.
    }
  }

  return { isCopied, copy }
}
