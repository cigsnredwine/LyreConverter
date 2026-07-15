import test from 'node:test'
import assert from 'node:assert/strict'
import { AUDIO_FORMATS, VIDEO_FORMATS, compatibleFormat, formatsForMediaType } from '../electron/format-utils.mjs'

test('audio queues expose audio outputs only', () => {
  assert.deepEqual(formatsForMediaType('audio'), AUDIO_FORMATS)
  assert.equal(formatsForMediaType('audio').includes('mp4'), false)
})

test('video queues expose video and audio outputs', () => {
  assert.deepEqual(formatsForMediaType('video'), [...VIDEO_FORMATS, ...AUDIO_FORMATS])
})

test('incompatible global formats fall back safely', () => {
  assert.equal(compatibleFormat('audio', 'm4v'), 'mp3')
  assert.equal(compatibleFormat('video', 'm4v'), 'm4v')
  assert.equal(compatibleFormat('video', 'not-a-format'), 'mp4')
})
