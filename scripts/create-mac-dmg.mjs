import { cp, mkdir, rm, symlink } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import packageJson from '../package.json' with { type: 'json' }

const exec = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const architecture = process.env.LYRE_ARCH || 'arm64'
const appName = `${packageJson.build.productName}.app`
const appSource = path.join(root, 'release', `mac-${architecture}`, appName)
const staging = path.join(root, 'release', 'dmg-staging')
const dmgPath = path.join(root, 'release', `${packageJson.build.productName}-${packageJson.version}-${architecture}.dmg`)

await rm(staging, { recursive: true, force: true })
await rm(dmgPath, { force: true })
await mkdir(staging, { recursive: true })
await cp(appSource, path.join(staging, appName), { recursive: true })
await symlink('/Applications', path.join(staging, 'Applications'))
await exec('hdiutil', ['create', '-volname', packageJson.build.productName, '-srcfolder', staging, '-ov', '-format', 'UDZO', dmgPath])
await rm(staging, { recursive: true, force: true })
console.log(`Created ${dmgPath}`)
