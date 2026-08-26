import {readFileSync} from 'node:fs'
import type {Plugin} from 'vite'

type Application = 'admin' | 'on-box'

interface ReleaseMetadata {
  schemaVersion: 1
  project: 'open-cinema-ui'
  application: Application
  version: string
}

function readJson(url: URL): Record<string, unknown> {
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>
}

export function createReleaseMetadata(
  application: Application,
  workspace: 'apps/admin' | 'apps/ui',
): {define: Record<string, string>; plugin: Plugin} {
  const rootManifest = readJson(new URL('../package.json', import.meta.url))
  const workspaceManifest = readJson(new URL(`../${workspace}/package.json`, import.meta.url))
  const version = rootManifest.version

  if (typeof version !== 'string' || workspaceManifest.version !== version) {
    throw new Error(`Release metadata version mismatch for ${workspace}`)
  }

  const metadata: ReleaseMetadata = {
    schemaVersion: 1,
    project: 'open-cinema-ui',
    application,
    version,
  }

  return {
    define: {
      __OPEN_CINEMA_UI_VERSION__: JSON.stringify(version),
    },
    plugin: {
      name: `open-cinema-release-metadata-${application}`,
      transformIndexHtml() {
        return [{
          tag: 'meta',
          attrs: {name: 'open-cinema-version', content: version},
          injectTo: 'head',
        }]
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'open-cinema-release.json',
          source: `${JSON.stringify(metadata, null, 2)}\n`,
        })
        if (application === 'admin') {
          this.emitFile({
            type: 'asset',
            fileName: 'contracts/audio-orchestration-client-v1.json',
            source: readFileSync(
              new URL('../contracts/audio-orchestration-client-v1.json', import.meta.url),
              'utf8',
            ),
          })
        }
      },
    },
  }
}
