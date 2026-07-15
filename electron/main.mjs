import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, realpath, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { autoUpdater } from 'electron-updater'
import { cleanupTempDirectory } from './temp-cleanup.mjs'
import { FORMAT_SET } from './format-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const bundledFfmpeg = require('ffmpeg-static')
const bundledFfprobe = require('ffprobe-static').path
const isDev = !app.isPackaged
const jobs = new Map()
const allowedOutputDirectories = new Set()
const TEMP_OUTPUT_DIRECTORY = path.join(app.getPath('temp'), 'Lyre Converter')
const MAX_INPUT_BYTES = 50 * 1024 * 1024 * 1024
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024 * 1024

function command(name) {
  if (name === 'ffmpeg' && bundledFfmpeg && existsSync(bundledFfmpeg)) return bundledFfmpeg
  if (name === 'ffprobe' && bundledFfprobe && existsSync(bundledFfprobe)) return bundledFfprobe
  if (!isDev) throw new Error(`Bundled ${name} is unavailable. Reinstall the application.`)
  const candidates = [
    path.join(process.resourcesPath, 'bin', name),
    path.join(__dirname, '..', 'bin', name),
    name,
  ]
  return candidates.find(candidate => candidate === name || existsSync(candidate)) || name
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function validateInputPath(inputPath) {
  if (typeof inputPath !== 'string' || inputPath.length === 0 || inputPath.length > 4096) throw new Error('Invalid input path.')
  const resolved = await realpath(inputPath)
  const details = await stat(resolved)
  if (!details.isFile()) throw new Error('The selected input is not a file.')
  if (details.size > MAX_INPUT_BYTES) throw new Error('This file is larger than the 50 GB limit.')
  return resolved
}

function validateJobPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid conversion request.')
  if (typeof payload.jobId !== 'string' || !/^[a-f0-9-]{36}$/i.test(payload.jobId)) throw new Error('Invalid conversion job ID.')
  if (typeof payload.format !== 'string' || !FORMAT_SET.has(payload.format)) throw new Error('Unsupported output format.')
  if (payload.duration !== undefined && (!Number.isFinite(payload.duration) || payload.duration <= 0)) throw new Error('Invalid media duration.')
}

function sendProgress(sender, payload) {
  if (!sender.isDestroyed()) sender.send('conversion-progress', payload)
}

function parseTime(value) {
  const match = String(value).match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0
}

function runProbe(inputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(command('ffprobe'), ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', inputPath])
    let stdout = ''; let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) return reject(new Error(stderr.trim() || 'ffprobe could not read this file.'))
      try {
        const data = JSON.parse(stdout)
        const video = data.streams?.find(stream => stream.codec_type === 'video')
        const audio = data.streams?.find(stream => stream.codec_type === 'audio')
        resolve({ duration: Number(data.format?.duration) || undefined, width: video?.width, height: video?.height, mediaType: video ? 'video' : audio ? 'audio' : undefined })
      } catch { reject(new Error('Could not read media metadata.')) }
    })
  })
}

const codecs = {
  mp4: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '320k'],
  mov: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '320k'],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0', '-c:a', 'libopus', '-b:a', '256k'],
  mkv: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '320k'],
  avi: ['-c:v', 'mpeg4', '-q:v', '1', '-c:a', 'mp3', '-b:a', '320k'],
  gif: ['-vf', 'fps=15,scale=960:-1:flags=lanczos'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '320k'],
  aac: ['-vn', '-c:a', 'aac', '-b:a', '320k', '-f', 'adts'],
  flac: ['-vn', '-c:a', 'flac'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '8'],
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '256k'],
  wma: ['-vn', '-c:a', 'wmav2', '-b:a', '320k'],
  aiff: ['-vn', '-c:a', 'pcm_s16be'],
  m4v: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '320k'],
  ogv: ['-c:v', 'libtheora', '-q:v', '10', '-c:a', 'libvorbis', '-q:a', '10'],
}

async function startConversion(sender, payload) {
  validateJobPayload(payload)
  const inputPath = await validateInputPath(payload.inputPath)
  return new Promise((resolve, reject) => {
    const outputDir = TEMP_OUTPUT_DIRECTORY
    const outputPath = path.join(outputDir, `${payload.jobId}.${payload.format}`)
    const args = ['-nostdin', '-y', '-i', inputPath, ...(codecs[payload.format] || []), outputPath]
    mkdir(outputDir, { recursive: true }).then(() => {
      const child = spawn(command('ffmpeg'), args)
      jobs.set(payload.jobId, child)
      let stderr = ''
      let timedOut = false
      const timeout = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 2 * 60 * 60 * 1000)
      child.stderr.on('data', chunk => {
        const message = String(chunk); stderr += message
        const match = message.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
        if (match && payload.duration) {
          const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
          sendProgress(sender, { jobId: payload.jobId, progress: Math.min(99, Math.max(1, Math.round(seconds / payload.duration * 100))) })
        }
      })
      child.on('error', error => { clearTimeout(timeout); jobs.delete(payload.jobId); unlink(outputPath).catch(() => undefined); reject(error) })
      child.on('close', code => {
        clearTimeout(timeout)
        jobs.delete(payload.jobId)
        if (timedOut) { unlink(outputPath).catch(() => undefined); return reject(new Error('Conversion exceeded the two-hour safety limit.')) }
        if (code !== 0) { unlink(outputPath).catch(() => undefined); return reject(new Error(stderr.match(/Error while.*|Invalid.*|Unknown encoder.*/)?.[0] || 'FFmpeg could not convert this file.')) }
        stat(outputPath).then(details => {
          if (details.size > MAX_OUTPUT_BYTES) throw new Error('The converted file exceeded the 100 GB safety limit.')
          sendProgress(sender, { jobId: payload.jobId, progress: 100 })
          resolve({ outputPath })
        }).catch(reject)
      })
    }).catch(reject)
  })
}

function availableOutputPath(directory, filename) {
  const extension = path.extname(filename)
  const base = path.basename(filename, extension)
  let candidate = path.join(directory, filename)
  let index = 2
  while (existsSync(candidate)) candidate = path.join(directory, `${base} (${index++})${extension}`)
  return candidate
}

async function saveOutput({ sourcePath, directory, filename }) {
  if (typeof sourcePath !== 'string' || typeof directory !== 'string' || typeof filename !== 'string') throw new Error('Invalid save request.')
  if (path.basename(filename) !== filename || filename.includes('\0') || filename.length > 255) throw new Error('Invalid output filename.')
  const safeSource = await realpath(sourcePath)
  const safeDirectory = await realpath(directory)
  const safeTempDirectory = await realpath(TEMP_OUTPUT_DIRECTORY).catch(() => TEMP_OUTPUT_DIRECTORY)
  if (!isInside(safeSource, safeTempDirectory)) throw new Error('The output source is outside the converter workspace.')
  if (!allowedOutputDirectories.has(safeDirectory)) throw new Error('Choose an output folder using the app.')
  await mkdir(directory, { recursive: true })
  const outputPath = availableOutputPath(safeDirectory, filename)
  await copyFile(safeSource, outputPath)
  await unlink(safeSource).catch(() => undefined)
  return { outputPath }
}

function broadcastUpdate(status, data = {}) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('update-status', { status, ...data })
  }
}

function configureUpdates() {
  if (isDev) return
  autoUpdater.autoDownload = false
  autoUpdater.on('checking-for-update', () => broadcastUpdate('checking'))
  autoUpdater.on('update-available', info => broadcastUpdate('available', { version: info.version }))
  autoUpdater.on('update-not-available', info => broadcastUpdate('up-to-date', { version: info.version }))
  autoUpdater.on('download-progress', progress => broadcastUpdate('downloading', { percent: Math.round(progress.percent) }))
  autoUpdater.on('update-downloaded', info => broadcastUpdate('downloaded', { version: info.version }))
  autoUpdater.on('error', error => broadcastUpdate('error', { message: error.message }))
  autoUpdater.checkForUpdates().catch(error => broadcastUpdate('error', { message: error.message }))
}

function createWindow() {
  const window = new BrowserWindow({ width: 1440, height: 980, minWidth: 980, minHeight: 720, backgroundColor: '#0b1013', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://127.0.0.1:5173') : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  if (isDev) window.loadURL('http://127.0.0.1:5173')
  else window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  cleanupTempDirectory(TEMP_OUTPUT_DIRECTORY).catch(() => undefined)
  ipcMain.handle('probe-file', async (_event, inputPath) => runProbe(await validateInputPath(inputPath)))
  ipcMain.handle('convert-video', (event, payload) => startConversion(event.sender, payload))
  ipcMain.handle('select-output-directory', async () => {
    const result = await dialog.showOpenDialog({ title: 'Choose where to save converted files', defaultPath: app.getPath('downloads'), properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled) return undefined
    const selected = await realpath(result.filePaths[0])
    allowedOutputDirectories.add(selected)
    return selected
  })
  ipcMain.handle('save-output', (_event, payload) => saveOutput(payload))
  ipcMain.handle('check-for-updates', async () => {
    if (isDev) return { status: 'development' }
    const result = await autoUpdater.checkForUpdates()
    return { status: result?.updateInfo ? 'checked' : 'unknown', version: result?.updateInfo?.version }
  })
  ipcMain.handle('download-update', () => autoUpdater.downloadUpdate())
  ipcMain.handle('install-update', () => { if (!isDev) autoUpdater.quitAndInstall() })
  ipcMain.handle('cancel-conversion', (_event, jobId) => { if (typeof jobId !== 'string' || !/^[a-f0-9-]{36}$/i.test(jobId)) return false; jobs.get(jobId)?.kill('SIGTERM'); jobs.delete(jobId); return true })
  ipcMain.handle('reveal-file', async (_event, outputPath) => { const safePath = await realpath(outputPath); if (!isInside(safePath, TEMP_OUTPUT_DIRECTORY) && ![...allowedOutputDirectories].some(directory => isInside(safePath, directory))) throw new Error('This file is outside the app workspace.'); return shell.showItemInFolder(safePath) })
  createWindow()
  configureUpdates()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('before-quit', event => {
  if (jobs.size) {
    event.preventDefault()
    for (const child of jobs.values()) child.kill('SIGTERM')
    jobs.clear()
    cleanupTempDirectory(TEMP_OUTPUT_DIRECTORY).finally(() => app.quit())
  } else {
    cleanupTempDirectory(TEMP_OUTPUT_DIRECTORY).catch(() => undefined)
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
