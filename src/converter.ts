export async function convertVideo(file: File, format: string, duration: number | undefined, onProgress: (p: number) => void) {
  if (!window.desktop) {
    throw new Error('Lyre Converter must be opened as a desktop app.')
  }
  const jobId = crypto.randomUUID()
  const inputPath = window.desktop.getPathForFile(file)
  const stopListening = window.desktop.onProgress(event => {
    if (event.jobId === jobId) onProgress(event.progress)
  })
  try {
    return await window.desktop.convertVideo({ jobId, inputPath, format, duration })
  } finally {
    stopListening()
  }
}
