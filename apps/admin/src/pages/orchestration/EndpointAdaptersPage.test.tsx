// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import axe from 'axe-core'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {MemoryRouter} from 'react-router'
import type {ManagedAudioAdapterDto} from '@open-cinema/shared'
import {EndpointAdaptersPage} from './EndpointAdaptersPage'

const api = vi.hoisted(() => ({
  adapterTypes: vi.fn(),
  adapters: vi.fn(),
  createAdapter: vi.fn(),
  updateAdapter: vi.fn(),
  restartAdapter: vi.fn(),
  deleteAdapter: vi.fn(),
}))

vi.mock('./client', () => ({audioApi: api}))

const typeCatalogue = {
  schemaVersion: 1 as const,
  items: [{
    kind: 'roc-receiver' as const,
    title: 'ROC receiver',
    description: 'Receive network audio as an input.',
    direction: 'input' as const,
    schemaVersion: 1 as const,
    configurationSchema: {
      type: 'object',
      required: ['localAddress', 'sourcePort'],
      properties: {
        localAddress: {type: 'string', title: 'Listen address', default: '0.0.0.0'},
        sourcePort: {type: 'integer', title: 'Source port', default: 10001, minimum: 1},
      },
    },
  }],
}

const adapter: ManagedAudioAdapterDto = {
  id: 'adapter-1',
  ownerId: 'user-1',
  schemaVersion: 1,
  desired: {
    name: 'Cinema ROC input',
    kind: 'roc-receiver',
    configuration: {localAddress: '0.0.0.0', sourcePort: 10001},
    enabled: true,
    restartGeneration: 0,
    updateVersion: 3,
    createdAt: '2026-08-23T00:00:00Z',
    updatedAt: '2026-08-23T00:00:00Z',
  },
  observed: {
    lifecycle: 'ready',
    health: 'healthy',
    processId: 222,
    runtimeGeneration: 1,
    configurationDigest: 'sha256:adapter',
    expectedNodeName: 'open-cinema-adapter-adapter-1',
    runtimeKey: 'runtime:1:node:44',
    progress: {},
    retryAt: null,
    lastError: {},
    startedAt: '2026-08-23T00:00:00Z',
    observedAt: '2026-08-23T00:00:01Z',
    updatedAt: '2026-08-23T00:00:01Z',
  },
}

beforeAll(() => {
  const getComputedStyle = window.getComputedStyle
  Object.defineProperty(window, 'getComputedStyle', {
    writable: true,
    value: (element: Element) => getComputedStyle(element),
  })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.adapterTypes.mockResolvedValue(typeCatalogue)
  api.adapters.mockResolvedValue({items: [adapter], pagination: {limit: 50, offset: 0, total: 1, nextOffset: null}})
  api.createAdapter.mockResolvedValue(adapter)
  api.updateAdapter.mockResolvedValue(adapter)
  api.restartAdapter.mockResolvedValue(adapter)
  api.deleteAdapter.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('endpoint adapter management', () => {
  it('shows desired and observed state with accessible lifecycle actions', async () => {
    const {container} = render(<MemoryRouter><EndpointAdaptersPage/></MemoryRouter>)

    expect(await screen.findByText('Cinema ROC input')).toBeTruthy()
    expect(screen.getByText('ready · healthy')).toBeTruthy()
    expect(screen.getByRole('link', {name: /View in Devices/}).getAttribute('href')).toBe('/devices')
    expect((screen.getByRole('button', {name: 'Restart Cinema ROC input'}) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', {name: 'Delete Cinema ROC input'}) as HTMLButtonElement).disabled).toBe(true)

    const results = await axe.run(container, {rules: {'color-contrast': {enabled: false}}})
    expect(results.violations).toEqual([])
  })

  it('creates a schema-driven adapter with catalogue defaults', async () => {
    api.adapters.mockResolvedValue({items: [], pagination: {limit: 50, offset: 0, total: 0, nextOffset: null}})
    render(<MemoryRouter><EndpointAdaptersPage/></MemoryRouter>)

    await screen.findByText(/No endpoint adapters yet/)
    fireEvent.click(screen.getByRole('button', {name: /Create adapter/}))
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('Listen address') as HTMLInputElement).value).toBe('0.0.0.0')
    expect((within(dialog).getByLabelText('Source port') as HTMLInputElement).value).toBe('10001')
    fireEvent.change(within(dialog).getByLabelText('Name'), {target: {value: 'Network television'}})
    fireEvent.click(within(dialog).getByRole('button', {name: 'Create'}))

    await waitFor(() => expect(api.createAdapter).toHaveBeenCalledWith({
      name: 'Network television',
      kind: 'roc-receiver',
      enabled: true,
      configuration: {localAddress: '0.0.0.0', sourcePort: 10001},
    }))
  })
})
