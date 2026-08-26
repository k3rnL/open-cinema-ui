import {execFileSync, spawnSync} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {
  APPLICATIONS,
  archiveName,
  assertTag,
  hasFlag,
  option,
  provenanceName,
  readJson,
  resolveRoot,
  sha256File,
} from './release-lib.mjs'

function fail(message) {
  throw new Error(message)
}

function extractSafely(archive, destination) {
  const entries = execFileSync('tar', ['-tzf', archive], {encoding: 'utf8'})
    .split('\n')
    .filter(Boolean)
  for (const entry of entries) {
    const normalized = path.posix.normalize(entry.replace(/^\.\//, ''))
    if (path.posix.isAbsolute(entry) || normalized === '..' || normalized.startsWith('../')) {
      fail(`Unsafe archive entry in ${path.basename(archive)}: ${entry}`)
    }
  }
  execFileSync('tar', ['-xzf', archive, '-C', destination], {stdio: 'inherit'})
}

function verifyStaticBuild(root, application, version) {
  const indexPath = path.join(root, 'index.html')
  const html = readFileSync(indexPath, 'utf8')
  const metadata = JSON.parse(readFileSync(path.join(root, 'open-cinema-release.json'), 'utf8'))
  if (metadata.project !== 'open-cinema-ui' || metadata.application !== application.application || metadata.version !== version) {
    fail(`${application.id} release metadata does not identify open-cinema-ui ${version}`)
  }
  if (!html.includes(`<meta name="open-cinema-version" content="${version}">`)) {
    fail(`${application.id} index.html has no matching runtime version metadata`)
  }

  const assetsRoot = path.join(root, 'assets')
  const assets = readdirSync(assetsRoot, {recursive: true, withFileTypes: true})
  if (!assets.some((entry) => entry.isFile() && entry.name.endsWith('.js'))) {
    fail(`${application.id} archive contains no JavaScript application entry point`)
  }

  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = match[1]
    if (/^(?:data:|https?:|#)/.test(reference)) continue
    const relative = reference.startsWith(application.basePath)
      ? reference.slice(application.basePath.length)
      : reference.replace(/^\.\//, '')
    if (!relative || relative.startsWith('/')) continue
    const referencedFile = path.resolve(root, relative.split(/[?#]/, 1)[0])
    if (!referencedFile.startsWith(`${path.resolve(root)}${path.sep}`)) fail(`Unsafe static reference: ${reference}`)
    try {
      readFileSync(referencedFile)
    } catch {
      fail(`${application.id} index references missing static asset ${reference}`)
    }
  }

  if (application.id === 'admin') {
    const sourceContract = JSON.stringify(readJson('contracts/audio-orchestration-client-v1.json'))
    const archivedContract = JSON.stringify(JSON.parse(readFileSync(
      path.join(root, 'contracts/audio-orchestration-client-v1.json'),
      'utf8',
    )))
    if (archivedContract !== sourceContract) fail('Administration API contract asset does not match the release source')
  }
}

const args = process.argv.slice(2)
const sourceVersion = readJson('package.json').version
const tag = option(args, '--tag', `v${sourceVersion}`)
assertTag(tag, sourceVersion)
const inputDir = path.resolve(option(args, '--input', resolveRoot('release-dist')))
const expectedFiles = APPLICATIONS.flatMap((application) => [
  archiveName(application, sourceVersion),
  provenanceName(application, sourceVersion),
])
const checksumsPath = path.join(inputDir, 'checksums.sha256')
const checksumEntries = new Map(
  readFileSync(checksumsPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line)
      if (!match) fail(`Invalid checksum line: ${line}`)
      return [match[2], match[1]]
    }),
)

for (const name of expectedFiles) {
  const expected = checksumEntries.get(name)
  if (!expected) fail(`checksums.sha256 is missing ${name}`)
  const actual = sha256File(path.join(inputDir, name))
  if (actual !== expected) fail(`SHA-256 mismatch for ${name}`)
}
if (checksumEntries.size !== expectedFiles.length) fail('checksums.sha256 contains unexpected release files')

const extractionRoot = mkdtempSync(path.join(tmpdir(), 'open-cinema-ui-release-'))
try {
  const extracted = {}
  for (const application of APPLICATIONS) {
    const artifact = archiveName(application, sourceVersion)
    const digest = sha256File(path.join(inputDir, artifact))
    const provenance = JSON.parse(readFileSync(
      path.join(inputDir, provenanceName(application, sourceVersion)),
      'utf8',
    ))
    if (
      provenance.schemaVersion !== 1
      || provenance.project !== 'open-cinema-ui'
      || provenance.application !== application.application
      || provenance.version !== sourceVersion
      || provenance.tag !== tag
      || provenance.artifact !== artifact
      || provenance.sha256 !== digest
      || provenance.buildTarget !== 'static-web'
      || !/^[0-9a-f]{40}$/i.test(provenance.commit || '')
      || !['clean', 'dirty'].includes(provenance.sourceTree)
      || typeof provenance.repository !== 'string'
      || !provenance.repository
      || typeof provenance.workflowRun !== 'string'
      || !provenance.workflowRun
      || (provenance.workflowRun !== 'local' && provenance.sourceTree !== 'clean')
    ) fail(`Invalid portable provenance for ${artifact}`)

    const destination = path.join(extractionRoot, application.id)
    mkdirSync(destination, {recursive: true})
    extractSafely(path.join(inputDir, artifact), destination)
    verifyStaticBuild(destination, application, sourceVersion)
    extracted[application.id] = destination
  }

  if (hasFlag(args, '--smoke')) {
    const result = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['playwright', 'test', '--grep', '@release'],
      {
        cwd: resolveRoot('.'),
        env: {
          ...process.env,
          RELEASE_ADMIN_DIR: extracted.admin,
          RELEASE_UI_DIR: extracted.ui,
          ADMIN_BASE_URL: 'http://127.0.0.1:4175/admin',
          ON_BOX_BASE_URL: 'http://127.0.0.1:4175/ui',
        },
        stdio: 'inherit',
      },
    )
    if (result.status !== 0) fail(`Served-build smoke failed with status ${String(result.status)}`)
  }
} finally {
  rmSync(extractionRoot, {recursive: true, force: true})
}

console.log(`Verified downloaded release assets for ${tag}${hasFlag(args, '--smoke') ? ' including served-build smoke' : ''}.`)
