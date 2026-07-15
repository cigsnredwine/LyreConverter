import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { cleanupTempDirectory } from '../electron/temp-cleanup.mjs'

test('cleanup removes temporary conversion files and folders', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lyre-cleanup-'))
  await writeFile(path.join(directory, 'job.mp3'), 'temporary')
  await mkdir(path.join(directory, 'nested'))
  await writeFile(path.join(directory, 'nested', 'job.wav'), 'temporary')
  await cleanupTempDirectory(directory)
  assert.deepEqual(await readdir(directory), [])
})
