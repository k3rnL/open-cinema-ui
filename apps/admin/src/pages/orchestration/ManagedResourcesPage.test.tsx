// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import axe from 'axe-core'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {MemoryRouter} from 'react-router'
import type {ManagedResourceDto} from '@open-cinema/shared'
import {ManagedResourcesPage} from './ManagedResourcesPage'

const api = vi.hoisted(() => ({
  managedResources: vi.fn(),
  invokeManagedResourceAction: vi.fn(),
}))

vi.mock('./client', () => ({audioApi: api}))

const adapter: ManagedResourceDto = {
  schemaVersion: 1,
  id: 'adapter:roc-input',
  resourceType: 'adapter',
  name: 'Television ROC input',
  kind: 'roc-receiver',
  version: null,
  versionStatus: 'unknown',
  desired: {lifecycle: 'running', enabled: true, updateVersion: 4},
  observed: {lifecycle: 'ready', health: 'healthy', mode: null, profile: null, lastError: {}, observedAt: '2026-08-28T20:00:00Z'},
  freshness: {observedAt: '2026-08-28T20:00:00Z', runtimeGeneration: 12, stale: false},
  actions: [{id: 'restart', label: 'Restart', available: true, reason: null, method: 'POST', href: '/api/audio/v1/adapters/roc-input/restart', updateVersion: 4}],
  correlations: [{kind: 'endpoint-candidate', subject: 'node:42', worldGeneration: 12, worldSequence: 8, evidence: {direction: 'input'}}],
}

const processor: ManagedResourceDto = {
  schemaVersion: 1,
  id: 'processor:camilladsp:main',
  resourceType: 'processor',
  name: 'CamillaDSP · main',
  kind: 'camilladsp',
  version: '4.0.3',
  versionStatus: 'known',
  desired: {lifecycle: 'managed', enabled: true, updateVersion: null},
  observed: {lifecycle: 'ready', health: 'healthy', mode: '8 channels', profile: 'Cinema', lastError: {}, observedAt: '2026-08-28T20:00:00Z'},
  freshness: {observedAt: '2026-08-28T20:00:00Z', runtimeGeneration: 12, stale: false},
  actions: [{id: 'restart', label: 'Restart', available: false, reason: 'A safe supervisor restart intent is not available yet.', method: null, href: null, updateVersion: null}],
  correlations: [],
}

const pluginSource: ManagedResourceDto = {
  schemaVersion: 1,
  id: 'plugin:open-cinema.librespot:source-a',
  resourceType: 'plugin-managed-source',
  name: 'Open Cinema A',
  kind: 'open-cinema.librespot',
  version: '0.8.0',
  versionStatus: 'known',
  desired: {lifecycle: 'running', enabled: true, updateVersion: 7},
  observed: {lifecycle: 'running', health: 'healthy', mode: 'idle', profile: 'discovery', lastError: {}, observedAt: '2026-08-30T10:00:00Z'},
  freshness: {observedAt: '2026-08-30T10:00:00Z', runtimeGeneration: 14, stale: false},
  actions: [{id: 'restart', label: 'Restart', available: true, reason: null, method: 'POST', href: '/api/plugins/open-cinema.librespot/instances/source-a/actions/restart', updateVersion: 7}],
  correlations: [],
}

beforeAll(() => {
  const getComputedStyle = window.getComputedStyle
  Object.defineProperty(window, 'getComputedStyle', {writable: true, value: (element: Element) => getComputedStyle(element)})
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class { observe() {} unobserve() {} disconnect() {} },
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.managedResources.mockResolvedValue({schemaVersion: 1, items: [adapter, pluginSource, processor]})
  api.invokeManagedResourceAction.mockResolvedValue({})
})

afterEach(cleanup)

describe('ManagedResourcesPage', () => {
  it('separates adapters from processors and derives actions from capabilities', async () => {
    const {container} = render(<MemoryRouter><ManagedResourcesPage/></MemoryRouter>)

    expect(await screen.findByText('Television ROC input')).toBeTruthy()
    expect(screen.getByText('Open Cinema A')).toBeTruthy()
    expect(screen.getByText('CamillaDSP · main')).toBeTruthy()
    expect(screen.getByRole('link', {name: /Configure adapters/}).getAttribute('href')).toBe('/managed-resources/adapters')

    const adapterRow = screen.getByText('Television ROC input').closest('tr')!
    const processorRow = screen.getByText('CamillaDSP · main').closest('tr')!
    expect((within(adapterRow).getByRole('button', {name: /Restart/}) as HTMLButtonElement).disabled).toBe(false)
    expect((within(processorRow).getByRole('button', {name: /Restart/}) as HTMLButtonElement).disabled).toBe(true)

    const results = await axe.run(container, {rules: {'color-contrast': {enabled: false}}})
    expect(results.violations).toEqual([])
  })

  it('invokes a resource action using its advertised capability', async () => {
    render(<MemoryRouter><ManagedResourcesPage/></MemoryRouter>)
    const sourceRow = (await screen.findByText('Open Cinema A')).closest('tr')!
    fireEvent.click(within(sourceRow).getByRole('button', {name: /Restart/}))
    fireEvent.click(await screen.findByRole('button', {name: 'Restart'}))
    await waitFor(() => expect(api.invokeManagedResourceAction).toHaveBeenCalledWith(pluginSource.actions[0]))
  })
})
