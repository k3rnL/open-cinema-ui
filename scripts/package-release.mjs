import {execFileSync} from 'node:child_process'
import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {assertVersionConsistency} from './check-version.mjs'
import {
  APPLICATIONS,
  archiveName,
  option,
  provenanceName,
  resolveRoot,
  sha256File,
} from './release-lib.mjs'

const args = process.argv.slice(2)
const version = assertVersionConsistency({tag: option(args, '--tag'), dist: true})
const tag = option(args, '--tag', `v${version}`)
const commit = option(
  args,
  '--commit',
  execFileSync('git', ['rev-parse', 'HEAD'], {cwd: resolveRoot('.'), encoding: 'utf8'}).trim(),
)
const repository = option(args, '--repository', 'k3rnL/open-cinema-ui')
const workflowRun = option(args, '--workflow-run', 'local')
const sourceTree = execFileSync(
  'git',
  ['status', '--porcelain', '--untracked-files=all'],
  {cwd: resolveRoot('.'), encoding: 'utf8'},
).trim() ? 'dirty' : 'clean'

if (!/^[0-9a-f]{40}$/i.test(commit)) throw new Error(`Invalid source commit: ${commit}`)
if (!repository || !workflowRun) throw new Error('Repository and workflow-run provenance must be non-empty')
if (workflowRun !== 'local' && sourceTree !== 'clean') {
  throw new Error('Workflow release packaging requires a clean source tree')
}

const outputDir = resolveRoot('release-dist')
rmSync(outputDir, {recursive: true, force: true})
mkdirSync(outputDir, {recursive: true})

const checksumFiles = []
for (const application of APPLICATIONS) {
  const artifact = archiveName(application, version)
  const artifactPath = path.join(outputDir, artifact)
  execFileSync('tar', [
    '--sort=name',
    '--mtime=UTC 1970-01-01',
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-czf',
    artifactPath,
    '-C',
    resolveRoot(`${application.workspace}/dist`),
    '.',
  ], {stdio: 'inherit'})

  const digest = sha256File(artifactPath)
  const provenance = provenanceName(application, version)
  writeFileSync(path.join(outputDir, provenance), `${JSON.stringify({
    schemaVersion: 1,
    project: 'open-cinema-ui',
    application: application.application,
    version,
    repository,
    tag,
    commit,
    sourceTree,
    workflowRun,
    buildTarget: 'static-web',
    artifact,
    sha256: digest,
  }, null, 2)}\n`)
  checksumFiles.push(artifact, provenance)
}

const checksums = checksumFiles
  .sort()
  .map((name) => `${sha256File(path.join(outputDir, name))}  ${name}`)
  .join('\n')
writeFileSync(path.join(outputDir, 'checksums.sha256'), `${checksums}\n`)

console.log(`Created ${outputDir} for ${tag}; no tag, push, or publication was performed.`)
