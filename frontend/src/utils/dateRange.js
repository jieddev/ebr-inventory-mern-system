// A report period picked with DateRangeFields: { mode: 'day' | 'range', from, to } ("YYYY-MM-DD").

// "YYYY-MM-DD" strings compare in date order.
export const isBackwards = (from, to) => Boolean(from && to && from > to)

// True when the period can be generated.
export function isValidRange({ mode, from, to }) {
  return mode === 'range' ? Boolean(from && to) && !isBackwards(from, to) : Boolean(from)
}

// The { from, to } to request; a single day is from === to.
export function rangePeriod({ mode, from, to }) {
  return { from, to: mode === 'range' ? to : from }
}
