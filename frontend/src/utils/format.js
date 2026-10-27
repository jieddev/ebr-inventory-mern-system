// Dates are calendar days stored as UTC midnight, so format them in UTC.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})
const numberFormat = new Intl.NumberFormat('en-US')

// "2026-10-16T00:00:00.000Z" → "10/16/2026"
export function formatDate(value) {
  return value ? dateFormat.format(new Date(value)) : '—'
}

export function formatNumber(value) {
  return numberFormat.format(value ?? 0)
}

// Today in the user's time zone as "YYYY-MM-DD", the value an <input type="date"> uses.
export function todayInputValue() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function pluralize(count, word) {
  return `${formatNumber(count)} ${word}${count === 1 ? '' : 's'}`
}
