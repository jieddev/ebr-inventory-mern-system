import { useEffect, useRef } from 'react'

// Calls onOutside when the user presses anywhere outside `ref` while `enabled` is true.
// Used to close dropdowns.
export function useClickOutside(ref, enabled, onOutside) {
  const onOutsideRef = useRef(onOutside)
  useEffect(() => {
    onOutsideRef.current = onOutside
  })

  useEffect(() => {
    if (!enabled) return
    function handlePointerDown(event) {
      if (!ref.current?.contains(event.target)) onOutsideRef.current()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [ref, enabled])
}
