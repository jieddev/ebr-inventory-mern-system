// The last filters and search of each list page, so switching tabs doesn't clear them.
// Kept for this browser window only (sessionStorage), and cleared on login and logout.
// The page number is left out: coming back starts on page 1.
const STORAGE_KEY = 'ebr.views'
const REMEMBERED_PATHS = ['/transactions', '/items', '/activity']

let views = load()

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(views))
  } catch {
    // Storage blocked or full: the views still last until the page reloads.
  }
}

export function rememberView(pathname, search) {
  if (!REMEMBERED_PATHS.includes(pathname)) return
  const params = new URLSearchParams(search)
  params.delete('page')
  const query = params.toString()
  if ((views[pathname] ?? '') === query) return
  views = { ...views, [pathname]: query }
  save()
}

// The path with its remembered filters, for links to that page.
export function viewPath(pathname) {
  const query = views[pathname]
  return query ? `${pathname}?${query}` : pathname
}

export function forgetViews() {
  views = {}
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing stored.
  }
}
