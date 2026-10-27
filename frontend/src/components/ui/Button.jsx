import './Button.css'

export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  isLoading = false,
  disabled,
  className = '',
  children,
  ...props
}) {
  const classes = ['btn', `btn-${variant}`, `btn-${size}`, block && 'btn-block', className]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} disabled={disabled || isLoading} {...props}>
      {isLoading && <span className="btn-spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}
