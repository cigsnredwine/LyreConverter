import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Check, ChevronDown, Clock3, Download, FileAudio, FileVideo, Pause, Play, Plus, RotateCcw, Search, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react'
import { convertVideo } from './converter'
import type { MediaType, VideoItem } from './types'

const VIDEO_FORMATS = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'ogv', 'gif']
const AUDIO_FORMATS = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff']
const FORMAT_LABELS: Record<string, string> = { mp4: 'MP4 Video', mov: 'MOV Video', webm: 'WebM Video', mkv: 'MKV Video', avi: 'AVI Video', m4v: 'M4V Video', ogv: 'OGV Video', gif: 'GIF Animation', mp3: 'MP3 Audio', wav: 'WAV Audio', m4a: 'M4A Audio', aac: 'AAC Audio', flac: 'FLAC Audio', ogg: 'OGG Audio', opus: 'Opus Audio', wma: 'WMA Audio', aiff: 'AIFF Audio' }
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif'])
const formatLabel = (format: string) => format.toUpperCase()
const formatName = (format: string) => FORMAT_LABELS[format] || formatLabel(format)
const bytes = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(2)} GB` : value >= 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1e3))} KB`
const time = (seconds?: number) => seconds ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}` : '—'
const isAudioFile = (file: File) => file.type.startsWith('audio/') || AUDIO_EXTENSIONS.has(file.name.split('.').pop()?.toLowerCase() || '')
const formatsFor = (mediaType: MediaType) => mediaType === 'audio' ? AUDIO_FORMATS : [...VIDEO_FORMATS, ...AUDIO_FORMATS]

function inspectMedia(file: File): Promise<Partial<VideoItem>> {
  return new Promise(resolve => {
    const media = document.createElement(isAudioFile(file) ? 'audio' : 'video')
    media.preload = 'metadata'
    media.onloadedmetadata = () => {
      resolve({ duration: media.duration, width: 'videoWidth' in media ? media.videoWidth : undefined, height: 'videoHeight' in media ? media.videoHeight : undefined })
      URL.revokeObjectURL(media.src)
    }
    media.onerror = () => resolve({})
    media.src = URL.createObjectURL(file)
  })
}

function Logo() {
  return <div className="logo"><img src="./assets/lyre-converter-logo-transparent.png" alt="" /><span>Lyre Converter</span></div>
}

function Stepper({ step }: { step: number }) {
  return <div className="stepper" aria-label="Conversion progress">
    {[['01', 'Add files'], ['02', 'Choose format'], ['03', 'Convert']].map(([number, label], index) => <div className={`step ${step > index + 1 ? 'complete' : step === index + 1 ? 'active' : ''}`} key={label}><span>{step > index + 1 ? <Check size={14} /> : number}</span><strong>{label}</strong>{index < 2 && <i />}</div>)}
  </div>
}

function FormatPicker({ value, onChange }: { value: string, onChange: (format: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const matches = (format: string) => `${format} ${formatName(format)}`.toLowerCase().includes(query.toLowerCase())
  return <div className="format-picker">
    <button className="format-trigger" onClick={() => setOpen(current => !current)}><span><b>{formatLabel(value)}</b> {formatName(value).replace(`${formatLabel(value)} `, '')}</span><ChevronDown size={16} /></button>
    {open && <div className="format-menu">
      <div className="format-search"><Search size={15} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search formats" /></div>
      <small>VIDEO</small>{VIDEO_FORMATS.filter(matches).map(format => <button key={format} onClick={() => { onChange(format); setOpen(false) }} className={value === format ? 'selected' : ''}><b>{formatLabel(format)}</b><span>{formatName(format).replace(`${formatLabel(format)} `, '')}</span>{value === format && <Check size={14} />}</button>)}
      <small>AUDIO</small>{AUDIO_FORMATS.filter(matches).map(format => <button key={format} onClick={() => { onChange(format); setOpen(false) }} className={value === format ? 'selected' : ''}><b>{formatLabel(format)}</b><span>{formatName(format).replace(`${formatLabel(format)} `, '')}</span>{value === format && <Check size={14} />}</button>)}
    </div>}
  </div>
}

function App() {
  const [items, setItems] = useState<VideoItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [converting, setConverting] = useState(false)
  const [paused, setPaused] = useState(false)
  const [defaultFormat, setDefaultFormat] = useState('mp4')
  const [destinationDir, setDestinationDir] = useState('')
  const [notice, setNotice] = useState('')
  const [update, setUpdate] = useState<{ status: string; version?: string; percent?: number; message?: string }>({ status: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)
  const pausedRef = useRef(false)
  const desktop = typeof window !== 'undefined' ? window.desktop : undefined
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items])
  const completed = items.filter(item => item.status === 'done').length
  const ready = items.filter(item => item.status === 'ready' || item.status === 'error').length
  const progress = items.length ? Math.round(items.reduce((sum, item) => sum + (item.status === 'done' ? 100 : item.progress), 0) / items.length) : 0
  const step = converting || completed > 0 ? 3 : items.length ? 2 : 1
  const queueMediaType = items.length && items.every(item => item.mediaType === 'audio') ? 'audio' : items.length && items.every(item => item.mediaType === 'video') ? 'video' : 'mixed'
  const effectiveDefaultFormat = queueMediaType === 'audio' && !AUDIO_FORMATS.includes(defaultFormat) ? 'mp3' : queueMediaType === 'video' && !VIDEO_FORMATS.includes(defaultFormat) ? 'mp4' : defaultFormat

  useEffect(() => {
    if (!desktop) return
    const stopListening = desktop.onUpdateStatus(setUpdate)
    desktop.checkForUpdates().catch(() => undefined)
    return stopListening
  }, [desktop])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const incoming = Array.from(files)
    const room = Math.max(0, 50 - items.length)
    if (!room) return setNotice('Your queue is full. Remove a file to add another.')
    if (incoming.length > room) setNotice(`Added ${room} files. The queue holds up to 50 items.`)
    const selected = incoming.slice(0, room)
    const created = await Promise.all(selected.map(async file => {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'media'
      const mediaType: MediaType = isAudioFile(file) ? 'audio' : 'video'
      const inputPath = desktop?.getPathForFile(file)
      const metadata = inputPath && desktop ? await desktop.probeFile(inputPath).catch(() => ({})) : await inspectMedia(file)
      const format = mediaType === 'audio' && defaultFormat === 'mp4' ? 'mp3' : defaultFormat
      return { id: crypto.randomUUID(), file, name: file.name.replace(/\.[^/.]+$/, ''), extension, inputPath, size: file.size, outputFormat: format, status: 'ready' as const, progress: 0, ...metadata, mediaType }
    }))
    setItems(current => [...current, ...created].slice(0, 50))
  }, [items.length, defaultFormat, desktop])

  const updateItem = (id: string, patch: Partial<VideoItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))

  async function startQueue() {
    if (!ready || converting) return
    if (!desktop) return setNotice('Lyre Converter must be opened as a desktop app.')
    const directory = await desktop.selectOutputDirectory()
    if (!directory) return
    setDestinationDir(directory); setConverting(true); setPaused(false); pausedRef.current = false; setNotice('')
    for (const item of items.filter(current => current.status !== 'done')) {
      while (pausedRef.current) await new Promise(resolve => setTimeout(resolve, 250))
      updateItem(item.id, { status: 'converting', progress: 0, error: undefined })
      try {
        if (!item.file) throw new Error('The source file is no longer available. Add it to the queue again.')
        const output = await convertVideo(item.file, item.outputFormat, item.duration, progressValue => updateItem(item.id, { progress: progressValue }))
        updateItem(item.id, { status: 'done', progress: 100, outputPath: output.outputPath })
      } catch (error) { updateItem(item.id, { status: 'error', error: error instanceof Error ? error.message : 'Conversion failed' }) }
    }
    setConverting(false); setPaused(false)
  }

  async function download(item: VideoItem) {
    if (!item.outputPath || !desktop || !destinationDir) return
    try {
      const result = await desktop.saveOutput({ sourcePath: item.outputPath, directory: destinationDir, filename: `${item.name}.${item.outputFormat}` })
      updateItem(item.id, { savedPath: result.outputPath }); setNotice(`Saved ${item.name}.${item.outputFormat}`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save the converted file.') }
  }

  async function downloadAll() {
    const completedItems = items.filter(item => item.status === 'done' && item.outputPath && !item.savedPath)
    for (const item of completedItems) await download(item)
    if (completedItems.length) setNotice(`Saved ${completedItems.length} ${completedItems.length === 1 ? 'file' : 'files'} to ${destinationDir}`)
  }

  function applyAll(format: string) {
    setDefaultFormat(format)
    setItems(current => current.map(item => item.status === 'done' ? item : { ...item, outputFormat: formatsFor(item.mediaType).includes(format) ? format : item.mediaType === 'audio' ? 'mp3' : format, status: 'ready' }))
  }

  return <div className="app-shell">
    <header><Logo /><div className="header-note"><ShieldCheck size={15} /> Private by default</div></header>
    <main>
      {update.status === 'available' && <div className="update-banner">Lyre Converter {update.version} is available.<button onClick={() => { setUpdate(current => ({ ...current, status: 'downloading', percent: 0 })); desktop?.downloadUpdate().catch(() => setUpdate({ status: 'error', message: 'Update download failed.' })) }}>Download update</button></div>}
      {update.status === 'downloading' && <div className="update-banner">Downloading update… {update.percent ?? 0}%</div>}
      {update.status === 'downloaded' && <div className="update-banner">Update ready. Restart Lyre Converter to install it.<button onClick={() => desktop?.installUpdate()}>Restart to update</button></div>}
      <section className="hero"><h1>Convert media <em>without the upload.</em></h1><p>Fast, private conversions powered by FFmpeg on your computer.</p><Stepper step={step} /></section>

      <section className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files) }}>
        <input ref={inputRef} type="file" accept="video/*,audio/*,.mkv,.avi,.m4v,.ogv,.mts,.m2ts,.mp3,.wav,.m4a,.flac,.aac,.ogg,.opus,.wma,.aiff" multiple hidden onChange={event => event.target.files && addFiles(event.target.files)} />
        <div className="upload-icon"><UploadCloud size={28} /></div><div className="drop-copy"><strong>Drop videos or audio here</strong><span>Up to 50 files · MP4, MOV, MKV, WebM, MP3, WAV and more</span></div><button className="primary compact" onClick={() => inputRef.current?.click()}><Plus size={17} /> Choose files</button>
        <div className="privacy-line"><ShieldCheck size={14} /> Files stay on this computer. Nothing is uploaded.</div>
      </section>

      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice('')}><X size={15} /></button></div>}

      <section className="workspace">
        <div className="queue-head"><div><h2>Conversion queue <span>{items.length}/50</span></h2><p>{items.length ? `${bytes(totalBytes)} total · ${queueMediaType === 'mixed' ? 'Mixed media formats' : queueMediaType === 'audio' ? 'Audio queue' : 'Video queue'} · Best quality is selected automatically` : 'Add media to start building your queue'}</p></div>{items.length > 0 && <div className="queue-tools"><label>Convert all to</label><FormatPicker value={effectiveDefaultFormat} onChange={applyAll} /><button className="text-button danger" onClick={() => setItems([])}><Trash2 size={15} /> Clear</button></div>}</div>

        {items.length === 0 ? <div className="empty-state"><div className="empty-art"><FileVideo size={34} /><AudioLines size={19} /><span className="orbit one" /><span className="orbit two" /></div><h3>Your queue is ready</h3><p>Drop in video or audio files above and choose where the finished files should go.</p></div> : <div className="queue-list">{items.map((item, index) => <article className="video-row" key={item.id}>
          <div className="file-index">{String(index + 1).padStart(2, '0')}</div><div className={`file-icon ${item.mediaType}`} aria-label={item.mediaType}>{item.mediaType === 'audio' ? <FileAudio size={21} /> : <FileVideo size={22} />}</div>
          <div className="file-info"><strong title={item.name}>{item.name}</strong><span>{formatLabel(item.extension)} · {item.mediaType === 'video' && item.width ? `${item.width}×${item.height} · ` : ''}{time(item.duration)} · {bytes(item.size)}</span>{item.error && <small className="error">{item.error}</small>}</div>
          <div className="conversion-arrow"><span>{formatLabel(item.extension)}</span><i>→</i></div><div className="row-select"><small>OUTPUT</small><select disabled={item.status === 'converting'} value={item.outputFormat} onChange={event => updateItem(item.id, { outputFormat: event.target.value, status: 'ready' })}>{formatsFor(item.mediaType).map(format => <option key={format} value={format}>{formatLabel(format)}</option>)}</select><ChevronDown size={14} /></div>
          <div className={`status ${item.status}`}>{item.status === 'ready' && <><span className="dot" /> Queued</>}{item.status === 'converting' && <div className="progress-wrap"><span>{item.progress === 0 ? 'Preparing…' : `Converting ${item.progress}%`}</span><i><b style={{ width: `${item.progress}%` }} /></i></div>}{item.status === 'done' && <button onClick={() => item.savedPath && desktop ? desktop.revealFile(item.savedPath) : download(item)}><Download size={16} /> {item.savedPath ? 'Show file' : 'Save file'}</button>}{item.status === 'error' && <button className="retry" onClick={() => updateItem(item.id, { status: 'ready', progress: 0, error: undefined })}><RotateCcw size={15} /> Retry</button>}</div>
          <button className="remove" disabled={item.status === 'converting'} onClick={() => setItems(current => current.filter(value => value.id !== item.id))}><X size={17} /></button>
        </article>)}</div>}

        {items.length > 0 && <div className="action-bar"><div className="queue-summary"><span><Clock3 size={15} /> {converting ? `${progress}% complete` : completed === items.length ? 'All conversions complete' : `${ready} ready to convert`}</span><small>{destinationDir ? `Saving to ${destinationDir.split('/').pop()}` : 'Choose an output folder when you start'}</small></div><div className="action-buttons">{completed > 0 && <button className="download-all" disabled={!items.some(item => item.status === 'done' && !item.savedPath)} onClick={downloadAll}><Download size={17} /> Save all</button>}{converting ? <button className="primary" onClick={() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }}>{paused ? <Play size={18} /> : <Pause size={18} />}{paused ? 'Resume queue' : 'Pause queue'}</button> : <button className="primary" disabled={!ready} onClick={startQueue}><Play size={18} fill="currentColor" /> Convert {ready || items.length} {ready === 1 ? 'item' : 'items'}</button>}</div></div>}
      </section>
      <section className="feature-strip"><div><span><ShieldCheck size={18} /></span><strong>Private by default</strong><p>Everything runs locally with no upload or account.</p></div><div><span>✦</span><strong>Best quality automatic</strong><p>Smart presets keep output quality high without extra knobs.</p></div><div><span><AudioLines size={18} /></span><strong>Video + audio</strong><p>Convert between popular media formats in one queue.</p></div></section>
    </main>
  </div>
}

export default App
