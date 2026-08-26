import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))
export const MANIFEST_PATHS = [
  'package.json',
  'apps/admin/package.json',
  'apps/ui/package.json',
  'packages/shared/package.json',
]

export const APPLICATIONS = [
  {
    id: 'admin',
    application: 'admin',
    workspace: 'apps/admin',
    basePath: '/admin/',
    archivePrefix: 'open-cinema-admin',
  },
  {
    id: 'ui',
    application: 'on-box',
    workspace: 'apps/ui',
    basePath: '/ui/',
    archivePrefix: 'open-cinema-ui',
  },
]

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function resolveRoot(relativePath) {
  return path.resolve(ROOT, relativePath)
}

export function readJson(relativePath) {
  return JSON.parse(readFileSync(resolveRoot(relativePath), 'utf8'))
}

export function writeJson(relativePath, value) {
  writeFileSync(resolveRoot(relativePath), `${JSON.stringify(value, null, 2)}\n`)
}

export function assertVersion(version, label = 'version') {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(`${label} must be an explicit SemVer value (for example 2.0.0); received ${String(version)}`)
  }
  return version
}

export function assertTag(tag, version) {
  const expected = `v${version}`
  if (tag !== expected) {
    throw new Error(`Tag/version mismatch: expected ${expected}, received ${tag}`)
  }
  return tag
}

export function archiveName(application, version) {
  return `${application.archivePrefix}-v${version}.tar.gz`
}

export function provenanceName(application, version) {
  return `${archiveName(application, version)}.provenance.json`
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function option(args, name, fallback = undefined) {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

export function hasFlag(args, name) {
  return args.includes(name)
}
