import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Download, FileAudio, FileVideo, ListMusic, Pause, Play, RotateCcw, Search, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react'
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
  return <div className="logo"><img src="./assets/lyre-converter-logo-transparent.png" alt="" /><span>LyreConverter</span></div>
}

function Stepper({ step }: { step: number }) {
  return <ol className="stepper" aria-label="Conversion progress">
    {['Add files', 'Choose format', 'Convert'].map((label, index) => (
      <li key={label} className={step > index + 1 ? 'complete' : ''} aria-current={step === index + 1 ? 'step' : undefined}>
        <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>{label}
      </li>
    ))}
  </ol>
}

function FormatPicker({ value, onChange, disabled, audioOnly }: { value: string, onChange: (format: string) => void, disabled: boolean, audioOnly: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const groups = [
    { label: 'Video', formats: audioOnly ? [] : VIDEO_FORMATS },
    { label: 'Audio', formats: AUDIO_FORMATS },
  ].map(group => ({
    ...group,
    formats: group.formats.filter(format => formatName(format).toLowerCase().includes(query.trim().toLowerCase())),
  })).filter(group => group.formats.length)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  return <div className="format-picker" ref={rootRef} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      setOpen(false)
      triggerRef.current?.focus()
    }
  }}>
    <button className="format-trigger" ref={triggerRef} disabled={disabled} aria-label={`Convert all to ${formatLabel(value)}`} aria-expanded={open && !disabled} onClick={() => {
      setQuery('')
      setOpen(current => !current)
    }}>{formatLabel(value)}<ChevronDown size={14} /></button>
    {open && !disabled && <div className="format-menu">
      <label className="format-search"><Search size={15} /><input autoFocus aria-label="Search formats" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search formats" /></label>
      {groups.map(group => <div className="format-group" key={group.label}>
        <small>{group.label}</small>
        {group.formats.map(format => <button key={format} aria-pressed={value === format} onClick={() => {
          onChange(format)
          setOpen(false)
          triggerRef.current?.focus()
        }}><span>{formatName(format)}</span>{value === format && <Check size={14} />}</button>)}
      </div>)}
      {!groups.length && <p className="format-empty">No matching formats</p>}
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
  const completed = items.filter(item => item.status === 'done').length
  const ready = items.filter(item => item.status === 'ready' || item.status === 'error').length
  const progress = items.length ? Math.round(items.reduce((sum, item) => sum + (item.status === 'done' ? 100 : item.progress), 0) / items.length) : 0
  const step = converting || completed > 0 ? 3 : items.length ? 2 : 1
  const audioOnly = items.length > 0 && items.every(item => item.mediaType === 'audio')
  const effectiveDefaultFormat = audioOnly && !AUDIO_FORMATS.includes(defaultFormat) ? 'mp3' : defaultFormat

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
      const format = formatsFor(mediaType).includes(defaultFormat) ? defaultFormat : 'mp3'
      return { id: crypto.randomUUID(), file, name: file.name.replace(/\.[^/.]+$/, ''), extension, inputPath, size: file.size, outputFormat: format, status: 'ready' as const, progress: 0, ...metadata, mediaType }
    }))
    setItems(current => [...current, ...created].slice(0, 50))
  }, [items.length, defaultFormat, desktop])

  const updateItem = (id: string, patch: Partial<VideoItem>) => setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))

  async function startQueue() {
    if (!ready || converting) return
    if (!desktop) return setNotice('LyreConverter must be opened as a desktop app.')
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
    setItems(current => current.map(item => item.status === 'done' ? item : { ...item, outputFormat: formatsFor(item.mediaType).includes(format) ? format : 'mp3', status: 'ready' }))
  }

  return <div className="app-shell">
    <header className="topbar"><Logo /><div className="header-note"><ShieldCheck size={16} /> On-device processing</div></header>
    <main>
      {update.status === 'available' && <div className="update-banner">LyreConverter {update.version} is available.<button className="secondary" onClick={() => { setUpdate(current => ({ ...current, status: 'downloading', percent: 0 })); desktop?.downloadUpdate().catch(() => setUpdate({ status: 'error', message: 'Update download failed.' })) }}>Download update</button></div>}
      {update.status === 'downloading' && <div className="update-banner" role="status">Downloading update… {update.percent ?? 0}%</div>}
      {update.status === 'downloaded' && <div className="update-banner">Update ready.<button className="secondary" onClick={() => desktop?.installUpdate()}>Restart to update</button></div>}

      <section className="hero">
        <div className="hero-copy">
          <h1>Media <em>converter.</em></h1>
          <p>Convert video and audio locally.</p>
          <Stepper step={step} />
        </div>
        <img className="hero-art" src="./assets/crimson-vinyl.jpg" alt="" />
      </section>

      {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={16} /></button></div>}

      <div className="workbench">
        <section className="panel intake" aria-labelledby="intake-title">
          <div className="panel-heading"><h2 id="intake-title">Add media</h2></div>
          <div className={`drop-zone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={event => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false)
          }} onDrop={event => { event.preventDefault(); setDragging(false); void addFiles(event.dataTransfer.files) }}>
            <input ref={inputRef} type="file" accept="video/*,audio/*,.mkv,.avi,.m4v,.ogv,.mts,.m2ts,.mp3,.wav,.m4a,.flac,.aac,.ogg,.opus,.wma,.aiff" multiple hidden onChange={event => {
              if (event.target.files?.length) void addFiles(event.target.files)
              event.target.value = ''
            }} />
            <UploadCloud className="upload-icon" size={34} strokeWidth={1.5} />
            <strong>{dragging ? 'Release to add files' : 'Drop video or audio here'}</strong>
            <button className="primary" onClick={() => inputRef.current?.click()}>Choose files</button>
          </div>
        </section>

        <section className="panel workspace" aria-labelledby="queue-title">
          <div className="panel-heading queue-head">
            <h2 id="queue-title">Conversion queue <span>{items.length} / 50</span></h2>
            {items.length > 0 && <div className="queue-tools">
              <span>Convert all to</span>
              <FormatPicker value={effectiveDefaultFormat} onChange={applyAll} disabled={converting} audioOnly={audioOnly} />
              <button className="icon-button danger" aria-label="Clear queue" title="Clear queue" disabled={converting} onClick={() => setItems([])}><Trash2 size={16} /></button>
            </div>}
          </div>

          {items.length === 0 ? <div className="empty-state">
            <div className="file-icon"><ListMusic size={24} strokeWidth={1.5} /></div>
            <h3>Queue is empty</h3>
            <p>Add files to choose their output formats.</p>
          </div> : <div className="queue-list">{items.map(item => <article className="video-row" key={item.id}>
            <div className="file-icon" aria-hidden="true">{item.mediaType === 'audio' ? <FileAudio size={20} /> : <FileVideo size={20} />}</div>
            <div className="file-info">
              <strong title={item.name}>{item.name}.{item.extension}</strong>
              <span>{formatLabel(item.extension)} · {item.mediaType === 'video' && item.width ? `${item.width}×${item.height} · ` : ''}{time(item.duration)} · {bytes(item.size)}</span>
              {item.error && <small className="error">{item.error}</small>}
            </div>
            <div className="row-select">
              <select aria-label={`Output format for ${item.name}`} disabled={converting} value={item.outputFormat} onChange={event => updateItem(item.id, { outputFormat: event.target.value, status: 'ready' })}>{formatsFor(item.mediaType).map(format => <option key={format} value={format}>{formatLabel(format)}</option>)}</select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
            <div className={`status ${item.status}`}>
              {item.status === 'ready' && <span className="queued-label">Queued</span>}
              {item.status === 'converting' && <div className="progress-wrap"><span>{item.progress === 0 ? 'Preparing…' : `${item.progress}%`}</span><progress aria-label={`Converting ${item.name}`} max={100} value={item.progress} /></div>}
              {item.status === 'done' && <button className="secondary" onClick={() => item.savedPath && desktop ? desktop.revealFile(item.savedPath) : download(item)}><Download size={14} /> {item.savedPath ? 'Show file' : 'Save file'}</button>}
              {item.status === 'error' && <button className="secondary retry" disabled={converting} onClick={() => updateItem(item.id, { status: 'ready', progress: 0, error: undefined })}><RotateCcw size={14} /> Retry</button>}
            </div>
            <button className="icon-button danger remove" aria-label={`Remove ${item.name}`} disabled={converting} onClick={() => setItems(current => current.filter(value => value.id !== item.id))}><X size={17} /></button>
          </article>)}</div>}
        </section>
      </div>

      <footer className="action-bar">
        <div className="queue-summary" role="status">
          <strong>{converting ? `${paused ? 'Queue paused · ' : ''}${progress}% complete` : !items.length ? 'No files queued' : completed === items.length ? 'All conversions complete' : `${ready} ${ready === 1 ? 'file' : 'files'} ready`}</strong>
          <small>{destinationDir && items.length ? `Output folder · ${destinationDir.split(/[\\/]/).pop()}` : 'Choose an output folder when you start'}</small>
        </div>
        <div className="action-buttons">
          {completed > 0 && <button className="secondary" disabled={!items.some(item => item.status === 'done' && !item.savedPath)} onClick={downloadAll}><Download size={16} /> Save all</button>}
          {converting ? <button className="primary" onClick={() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current) }}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? 'Resume queue' : 'Pause queue'}</button> : <button className="primary" disabled={!ready} onClick={startQueue}><Play size={16} fill="currentColor" /> {ready ? `Convert ${ready} ${ready === 1 ? 'file' : 'files'}` : 'Convert'}</button>}
        </div>
      </footer>
    </main>
  </div>
}

export default App
