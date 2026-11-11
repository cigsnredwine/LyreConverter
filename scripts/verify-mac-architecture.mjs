import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { Arch } from 'electron-builder'

function* bundleFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* bundleFiles(filename)
    if (entry.isFile()) yield filename
  }
}

function requireArm64(bundle, filename) {
  const architectures = execFileSync('lipo', ['-archs', filename], { encoding: 'utf8' }).trim()
  if (!architectures.split(/\s+/).includes('arm64')) {
    throw new Error(`${path.relative(bundle, filename)} contains ${architectures}; expected an arm64 slice. Install dependencies using native Apple Silicon Node before packaging.`)
  }
}

export default function verifyMacArchitecture({ electronPlatformName, arch, appOutDir, packager }) {
  if (electronPlatformName !== 'darwin' || arch !== Arch.arm64) return

  const bundle = path.join(appOutDir, `${packager.appInfo.productFilename}.app`)
  const dependencies = path.join(bundle, 'Contents/Resources/app.asar.unpacked/node_modules')
  const mediaTools = new Set([
    path.join(dependencies, 'ffmpeg-static/ffmpeg'),
    path.join(dependencies, '@derhuerst/ffprobe-static/ffprobe'),
  ])

  for (const filename of bundleFiles(bundle)) {
    if (mediaTools.delete(filename) || execFileSync('file', ['-b', filename], { encoding: 'utf8' }).startsWith('Mach-O')) {
      requireArm64(bundle, filename)
    }
  }
  if (mediaTools.size) {
    throw new Error(`Missing unpacked media tools: ${Array.from(mediaTools, filename => path.relative(bundle, filename)).join(', ')}`)
  }
}
