export type VideoStatus = 'ready' | 'converting' | 'done' | 'error'
export type MediaType = 'video' | 'audio'

export interface VideoItem {
  id: string
  file?: File
  inputPath?: string
  name: string
  extension: string
  mediaType: MediaType
  size: number
  duration?: number
  width?: number
  height?: number
  outputFormat: string
  status: VideoStatus
  progress: number
  outputPath?: string
  savedPath?: string
  error?: string
}
