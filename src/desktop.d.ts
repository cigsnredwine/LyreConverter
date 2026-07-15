interface DesktopConversionPayload {
  jobId: string
  inputPath: string
  format: string
  duration?: number
}

interface DesktopApi {
  getPathForFile(file: File): string
  probeFile(inputPath: string): Promise<{ duration?: number; width?: number; height?: number; mediaType?: 'audio' | 'video' }>
  convertVideo(payload: DesktopConversionPayload): Promise<{ outputPath: string }>
  selectOutputDirectory(): Promise<string | undefined>
  saveOutput(payload: { sourcePath: string; directory: string; filename: string }): Promise<{ outputPath: string }>
  cancelConversion(jobId: string): Promise<boolean>
  revealFile(outputPath: string): Promise<void>
  onProgress(callback: (progress: { jobId: string; progress: number }) => void): () => void
  checkForUpdates(): Promise<{ status: string; version?: string }>
  downloadUpdate(): Promise<unknown>
  installUpdate(): void
  onUpdateStatus(callback: (status: { status: string; version?: string; percent?: number; message?: string }) => void): () => void
}

interface Window { desktop?: DesktopApi }
