// Saves a file response (requested with responseType: 'blob') under the server's file name.
export function saveDownload(response, fallbackName) {
  const filename = /filename="?([^";]+)"?/.exec(response.headers['content-disposition'] ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
