import './Logo.css'

// TODO: swap for the real logo asset from Figma.
export default function Logo({ size = 'md' }) {
  return (
    <span className={`logo logo-${size}`} aria-label="EBR">
      EBR
    </span>
  )
}
