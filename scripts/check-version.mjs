import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {
  APPLICATIONS,
  MANIFEST_PATHS,
  archiveName,
  assertTag,
  assertVersion,
  option,
  provenanceName,
  readJson,
  resolveRoot,
} from './release-lib.mjs'

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${expected}; received ${String(actual)}`)
  }
}

export function assertVersionConsistency({tag, dist = false, artifacts} = {}) {
  const manifests = new Map(MANIFEST_PATHS.map((manifestPath) => [manifestPath, readJson(manifestPath)]))
  const version = assertVersion(manifests.get('package.json').version, 'root package version')

  for (const [manifestPath, manifest] of manifests) {
    assertEqual(manifest.version, version, `${manifestPath} version`)
  }
  for (const manifestPath of ['apps/admin/package.json', 'apps/ui/package.json']) {
    assertEqual(
      manifests.get(manifestPath).dependencies?.['@open-cinema/shared'],
      version,
      `${manifestPath} @open-cinema/shared dependency`,
    )
  }

  const lock = readJson('package-lock.json')
  assertEqual(lock.version, version, 'package-lock.json top-level version')
  for (const workspacePath of ['', 'apps/admin', 'apps/ui', 'packages/shared']) {
    assertEqual(
      lock.packages?.[workspacePath]?.version,
      version,
      `package-lock.json workspace ${workspacePath || '<root>'} version`,
    )
  }
  for (const workspacePath of ['apps/admin', 'apps/ui']) {
    assertEqual(
      lock.packages?.[workspacePath]?.dependencies?.['@open-cinema/shared'],
      version,
      `package-lock.json ${workspacePath} @open-cinema/shared dependency`,
    )
  }

  const contract = readJson('contracts/audio-orchestration-client-v1.json')
  assertEqual(contract.contractSetVersion, 1, 'administration contract-set version')
  assertEqual(contract.supported?.apiVersion, 1, 'administration API contract version')

  if (tag) assertTag(tag, version)

  if (dist) {
    for (const application of APPLICATIONS) {
      const distRoot = `${application.workspace}/dist`
      const metadata = readJson(`${distRoot}/open-cinema-release.json`)
      assertEqual(metadata.schemaVersion, 1, `${application.id} release metadata schema`)
      assertEqual(metadata.project, 'open-cinema-ui', `${application.id} release metadata project`)
      assertEqual(metadata.application, application.application, `${application.id} release metadata application`)
      assertEqual(metadata.version, version, `${application.id} release metadata version`)

      const html = readFileSync(resolveRoot(`${distRoot}/index.html`), 'utf8')
      const versionMeta = `<meta name="open-cinema-version" content="${version}">`
      if (!html.includes(versionMeta)) {
        throw new Error(`${application.id} index.html is missing ${versionMeta}`)
      }
    }

    const sourceContract = JSON.stringify(readJson('contracts/audio-orchestration-client-v1.json'))
    const builtContract = JSON.stringify(readJson('apps/admin/dist/contracts/audio-orchestration-client-v1.json'))
    assertEqual(builtContract, sourceContract, 'built administration API contract asset')
  }

  if (artifacts) {
    const artifactRoot = resolveRoot(artifacts)
    const expectedArchives = APPLICATIONS.map((application) => archiveName(application, version)).sort()
    const expectedFiles = [
      ...expectedArchives,
      ...APPLICATIONS.map((application) => provenanceName(application, version)),
      'checksums.sha256',
    ]
    for (const expectedFile of expectedFiles) {
      if (!existsSync(`${artifactRoot}/${expectedFile}`)) {
        throw new Error(`Release artifact name/version mismatch: missing ${expectedFile}`)
      }
    }
    const actualArchives = readdirSync(artifactRoot)
      .filter((name) => /^open-cinema-.*\.tar\.gz$/.test(name))
      .sort()
    assertEqual(JSON.stringify(actualArchives), JSON.stringify(expectedArchives), 'release archive names')
  }

  return version
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const args = process.argv.slice(2)
  const tag = option(args, '--tag')
  const artifacts = option(args, '--artifacts')
  const dist = args.includes('--dist')
  const version = assertVersionConsistency({tag, dist, artifacts})
  console.log(`Version consistency passed for ${version}${tag ? ` (${tag})` : ''}${dist ? ' including production metadata' : ''}${artifacts ? ' including artifact names' : ''}.`)
}
