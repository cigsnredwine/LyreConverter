import { mkdir, rm, symlink, lstat } from 'node:fs/promises'
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
// `fs.cp` can rewrite framework symlinks as absolute paths on macOS. That
// makes an app copied out of the DMG point back to the build machine. `ditto`
// is Apple's bundle-aware copier and preserves Electron's relative links.
await exec('ditto', [appSource, path.join(staging, appName)])
const frameworkLink = path.join(staging, appName, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Resources')
const frameworkStat = await lstat(frameworkLink)
if (!frameworkStat.isSymbolicLink()) {
  throw new Error('Electron Framework Resources link was not preserved while staging the DMG')
}
await symlink('/Applications', path.join(staging, 'Applications'))
await exec('hdiutil', ['create', '-volname', packageJson.build.productName, '-srcfolder', staging, '-ov', '-format', 'UDZO', dmgPath])
await rm(staging, { recursive: true, force: true })
console.log(`Created ${dmgPath}`)
