import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'

export async function cleanupTempDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  await Promise.all(entries.map(entry => rm(path.join(directory, entry.name), { recursive: entry.isDirectory(), force: true }).catch(() => undefined)))
}
