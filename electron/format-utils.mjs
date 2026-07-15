export const VIDEO_FORMATS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'ogv', 'gif']
export const AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff']
export const FORMAT_SET = new Set([...VIDEO_FORMATS, ...AUDIO_FORMATS])

export function formatsForMediaType(mediaType) {
  return mediaType === 'audio' ? AUDIO_FORMATS : [...VIDEO_FORMATS, ...AUDIO_FORMATS]
}

export function compatibleFormat(mediaType, requested) {
  return formatsForMediaType(mediaType).includes(requested) ? requested : mediaType === 'audio' ? 'mp3' : 'mp4'
}
