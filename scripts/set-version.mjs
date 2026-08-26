import {MANIFEST_PATHS, assertVersion, readJson, writeJson} from './release-lib.mjs'

const args = process.argv.slice(2)
if (args.length !== 1) {
  throw new Error('Usage: npm run version:set -- <exact-version>')
}

const version = assertVersion(args[0])
const manifests = new Map(MANIFEST_PATHS.map((manifestPath) => [manifestPath, readJson(manifestPath)]))
const lock = readJson('package-lock.json')

for (const manifest of manifests.values()) manifest.version = version
for (const manifestPath of ['apps/admin/package.json', 'apps/ui/package.json']) {
  manifests.get(manifestPath).dependencies['@open-cinema/shared'] = version
}

const lockWorkspacePaths = ['', 'apps/admin', 'apps/ui', 'packages/shared']
for (const workspacePath of lockWorkspacePaths) {
  if (!lock.packages?.[workspacePath]) {
    throw new Error(`package-lock.json is missing workspace entry ${workspacePath || '<root>'}`)
  }
  lock.packages[workspacePath].version = version
}
lock.version = version
lock.packages['apps/admin'].dependencies['@open-cinema/shared'] = version
lock.packages['apps/ui'].dependencies['@open-cinema/shared'] = version

for (const [manifestPath, manifest] of manifests) writeJson(manifestPath, manifest)
writeJson('package-lock.json', lock)

console.log(`Set the root and all workspace versions to ${version}; no commit, tag, push, or publish was performed.`)
