// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {App as AntApp, ConfigProvider} from 'antd'
import {MemoryRouter, Route, Routes} from 'react-router'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import type {InstalledPluginDto, PluginCatalogueEntryDto, PluginOperationDto} from '@open-cinema/shared'
import {PluginDetailPage, PluginsPage} from './PluginsPage'

const api = vi.hoisted(() => ({
  catalogue: vi.fn(),
  installed: vi.fn(),
  operations: vi.fn(),
  inspectSource: vi.fn(),
  install: vi.fn(),
  lifecycle: vi.fn(),
}))
vi.mock('./client', () => ({pluginApi: api}))

const catalogue: PluginCatalogueEntryDto[] = [
  {
    id: 'open-cinema.librespot',
    displayName: 'Spotify Connect',
    summary: 'Receives Spotify Connect audio as a managed source.',
    publisher: 'Open Cinema',
    verifiedPublisher: true,
    repository: 'https://github.com/open-cinema/open-cinema-librespot.git',
    documentationUrl: 'https://example.test/librespot',
    icon: 'spotify',
    versions: [{
      version: '1.0.0',
      revision: 'v1.0.0',
      resolvedCommit: null,
      artifactDigest: `sha256:${'a'.repeat(64)}`,
      mutable: false,
      published: true,
      compatible: true,
      installable: true,
      capabilities: ['managed-audio-source', 'admin-ui'],
      permissions: [{id: 'network.spotify', reason: 'Connects to Spotify services.'}],
      artifacts: [{operatingSystem: 'linux', architecture: 'x86_64', url: 'https://example.test/librespot.whl', digest: `sha256:${'a'.repeat(64)}`}],
      currentPlatform: {operatingSystem: 'linux', architecture: 'x86_64', artifactAvailable: true},
    }],
    latestVersion: '1.0.0',
    compatible: true,
    installable: true,
    installed: false,
    installedVersion: null,
    desiredState: null,
    observedState: null,
    health: null,
    updateAvailable: false,
  },
  {
    id: 'example.future',
    displayName: 'Future plugin',
    summary: 'Requires a newer Open Cinema release.',
    publisher: 'Example',
    verifiedPublisher: false,
    repository: 'https://example.test/future.git',
    documentationUrl: 'https://example.test/future',
    icon: 'plugin',
    versions: [],
    latestVersion: '9.0.0',
    compatible: false,
    installable: false,
    installed: false,
    installedVersion: null,
    desiredState: null,
    observedState: null,
    health: null,
    updateAvailable: false,
  },
]

const installed: InstalledPluginDto[] = [{
  id: 'open-cinema.counter',
  distribution: 'open-cinema-counter',
  installedVersion: '2.0.0',
  desiredState: 'enabled',
  observedState: 'started',
  health: 'healthy',
  activeGeneration: 'generation-1',
  lastKnownGoodGeneration: 'generation-1',
  manifest: {displayName: 'Counter example', capabilities: [{kind: 'admin-ui'}], permissions: []},
  provenance: {sourceType: 'bundled', resolvedRevision: 'abc123'},
  lifecycleImpact: {},
  updateVersion: 3,
  runtime: {},
  actions: [{id: 'disable', label: 'Disable', available: true, reason: null, method: 'POST', href: '/disable', confirmation: 'confirm', concurrencyToken: '3', lifecycleImpact: 'hot'}],
  updatedAt: '2026-08-29T22:00:00Z',
}]

function operation(
  status: PluginOperationDto['status'],
  requestedAt: string,
): PluginOperationDto {
  return {
    id: `${status}-${requestedAt}`,
    pluginId: 'open-cinema.librespot',
    kind: 'update',
    status,
    stage: status === 'failed' ? 'resolving' : 'complete',
    progress: 100,
    effectiveLifecycleImpact: 'hot',
    inputGeneration: null,
    outputGeneration: null,
    cancellation: {requested: false, allowed: false},
    concurrencyToken: '4',
    diagnostics: status === 'failed' ? [{message: 'Old failure'}] : [],
    requestedAt,
    startedAt: requestedAt,
    updatedAt: requestedAt,
    completedAt: requestedAt,
    restartAction: null,
    links: {self: '/operation', cancel: '/cancel'},
  }
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {writable: true, value: vi.fn(() => ({matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()}))})
  Object.defineProperty(globalThis, 'ResizeObserver', {writable: true, value: class {observe() {} unobserve() {} disconnect() {}}})
})

beforeEach(() => {
  vi.clearAllMocks()
  api.catalogue.mockResolvedValue(catalogue)
  api.installed.mockResolvedValue(installed)
  api.operations.mockResolvedValue([])
})

afterEach(cleanup)

function renderRoute(path = '/plugins') {
  return render(
    <ConfigProvider>
      <AntApp>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/plugins" element={<PluginsPage/>}/>
            <Route path="/plugins/manage/:pluginId" element={<PluginDetailPage/>}/>
          </Routes>
        </MemoryRouter>
      </AntApp>
    </ConfigProvider>,
  )
}

describe('Plugins administration', () => {
  it('keeps Marketplace and Installed distinct, searchable, and compatibility guarded', async () => {
    renderRoute()
    expect(await screen.findByText('Spotify Connect')).toBeTruthy()
    expect(screen.getByText('Future plugin')).toBeTruthy()
    expect(screen.getAllByText('Incompatible')).toHaveLength(2)
    expect(screen.getByRole('button', {name: /Incompatible/}).hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByPlaceholderText('Search plugins'), {target: {value: 'Spotify'}})
    expect(screen.queryByText('Future plugin')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Search plugins'), {target: {value: ''}})
    fireEvent.click(screen.getByText('Installed (1)'))
    expect(await screen.findByText('Counter example')).toBeTruthy()
    expect(screen.queryByText('Spotify Connect')).toBeNull()
  })

  it('shows the exact marketplace artifact and permissions before installation', async () => {
    renderRoute('/plugins/manage/open-cinema.librespot')

    expect(await screen.findByText('https://example.test/librespot.whl')).toBeTruthy()
    expect(screen.getByText(/network.spotify/)).toBeTruthy()
    expect(screen.getByText(/Connects to Spotify services/)).toBeTruthy()
  })

  it('shows explicit Git trust and installed lifecycle/provenance details', async () => {
    renderRoute()
    fireEvent.click(await screen.findByRole('button', {name: /Install from Git/i}))
    expect(screen.getByText('Git plugins execute trusted Python code')).toBeTruthy()
    expect(screen.getByText(/not sandboxed/i)).toBeTruthy()
    cleanup()

    renderRoute('/plugins/manage/open-cinema.counter')
    expect(await screen.findByText('Counter example')).toBeTruthy()
    expect(screen.getByText('abc123')).toBeTruthy()
    expect(screen.getByRole('button', {name: 'Disable'}).hasAttribute('disabled')).toBe(false)
    await waitFor(() => expect(api.catalogue).toHaveBeenCalled())
  })

  it('does not present an older failure after a newer operation succeeded', async () => {
    api.operations.mockResolvedValue([
      operation('failed', '2026-08-30T09:00:00Z'),
      operation('succeeded', '2026-08-30T10:00:00Z'),
    ])

    renderRoute()

    expect(await screen.findByText('Spotify Connect')).toBeTruthy()
    expect(screen.queryByText(/Last plugin operation failed/)).toBeNull()
    expect(screen.queryByText('Old failure')).toBeNull()
  })

  it('presents the most recent terminal failure', async () => {
    api.operations.mockResolvedValue([
      operation('succeeded', '2026-08-30T09:00:00Z'),
      operation('failed', '2026-08-30T10:00:00Z'),
    ])

    renderRoute()

    expect(await screen.findByText('Last plugin operation failed during resolving')).toBeTruthy()
    expect(screen.getByText('Old failure')).toBeTruthy()
  })
})
