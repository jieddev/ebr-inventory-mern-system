// Same rules as the API (backend services/itemId.service.js): "12", "00012", "itm-12" → "ITM-00012".
// Returns '' for anything that isn't an item ID.
export function parseItemId(text) {
  const match = /^\s*(?:ITM)?[-\s]?(\d{1,9})\s*$/i.exec(text)
  const n = match && Number(match[1])
  return n ? `ITM-${String(n).padStart(5, '0')}` : ''
}

// Typed in full (5+ digits, e.g. "ITM-00012" or "00012"), so it can be looked up without
// waiting for Enter: a short "1" could still become "12" or "123".
export function isCompleteItemId(text) {
  return /^\s*(?:ITM)?[-\s]?\d{5,}\s*$/i.test(text)
}
