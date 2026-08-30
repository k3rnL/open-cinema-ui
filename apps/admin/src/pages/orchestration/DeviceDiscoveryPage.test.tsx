// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import axe from 'axe-core'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {ConfigProvider} from 'antd'
import type {EndpointAudioLevelDto, EndpointCandidateExplanationDto, LogicalEndpointDto} from '@open-cinema/shared'
import {DeviceDiscoveryPage} from './DeviceDiscoveryPage'

const api = vi.hoisted(() => ({
  metadata: vi.fn(),
  endpoints: vi.fn(),
  endpointCandidates: vi.fn(),
  endpointExplanation: vi.fn(),
  endpointLevel: vi.fn(),
  updateEndpointLevel: vi.fn(),
  bindEndpoint: vi.fn(),
  previewSelector: vi.fn(),
  createEndpoint: vi.fn(),
}))

vi.mock('./client', () => ({audioApi: api}))

const endpoint: LogicalEndpointDto = {
  id: 'speakers',
  name: 'Main speakers',
  ownerId: 'user-1',
  direction: 'output',
  selector: {version: 1, match: 'all', predicates: [
    {path: 'direction', operator: 'exact', value: 'output'},
    {path: 'node.name', operator: 'exact', value: 'alsa-main'},
  ]},
  tags: ['main'],
  groups: [],
  policyMetadata: {},
  explicitBinding: null,
  lastKnown: {lastSeen: '2026-08-28T20:00:00Z'},
  updateVersion: 2,
  createdAt: '2026-08-28T19:00:00Z',
  updatedAt: '2026-08-28T20:00:00Z',
}

const explanation: EndpointCandidateExplanationDto = {
  endpoint,
  resolution: {
    status: 'matched',
    selectedRuntimeKey: 'runtime:12:node:42',
    tiedRuntimeKeys: [],
    diagnostics: [{
      runtimeKey: 'runtime:12:node:42',
      name: 'alsa-main',
      matched: true,
      score: 100,
      predicates: [{path: 'node.name', operator: 'exact', matched: true}],
      acceptedEvidence: ['Device name matched exactly.'],
      rejectedEvidence: [],
    }],
    selectorIssues: [],
  },
  world: {generation: 12, sequence: 8, runtimeAvailable: true},
}

const level: EndpointAudioLevelDto = {
  schemaVersion: 1,
  scope: 'device-level',
  endpointId: endpoint.id,
  direction: 'output',
  availability: 'available',
  desired: {level: 0.7, muted: false},
  master: {level: 0.8, muted: false, updateVersion: 3},
  effective: {level: 0.56, muted: false},
  observed: {level: 0.56, muted: false, known: true},
  capabilities: {volume: {readable: true, writable: true}, mute: {readable: true, writable: true}},
  applying: false,
  degraded: [],
  runtimeVersion: '12:42',
  updateVersion: 5,
  updatedAt: '2026-08-28T20:00:00Z',
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
  api.metadata.mockResolvedValue({})
  api.endpoints.mockResolvedValue({items: [endpoint], pagination: {limit: 50, offset: 0, total: 1, nextOffset: null}})
  api.endpointCandidates.mockResolvedValue({items: [{
    id: 'candidate-1',
    projectionType: 'endpoint-candidate',
    subject: 'node:42',
    worldGeneration: 12,
    worldSequence: 8,
    observedAt: '2026-08-28T20:00:00Z',
    payload: {runtimeKey: 'runtime:12:node:42', direction: 'output', name: 'alsa-main', description: 'Main amplifier'},
  }], pagination: {limit: 50, offset: 0, total: 1, nextOffset: null}})
  api.endpointExplanation.mockResolvedValue(explanation)
  api.endpointLevel.mockResolvedValue({value: level, etag: '"5"'})
  api.updateEndpointLevel.mockResolvedValue({value: {...level, desired: {...level.desired, muted: true}, updateVersion: 6}, etag: '"6"'})
})

afterEach(cleanup)

describe('DeviceDiscoveryPage', () => {
  it('presents human device evidence and capability-aware level controls', async () => {
    const {container} = render(<ConfigProvider><DeviceDiscoveryPage/></ConfigProvider>)

    const name = await screen.findByText('Main speakers')
    expect(screen.getByText('volume control · mute control')).toBeTruthy()
    expect(screen.getByRole('slider', {name: 'Main speakers level'})).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name: 'Mute Main speakers'}))
    await waitFor(() => expect(api.updateEndpointLevel).toHaveBeenCalledWith('speakers', 5, '12:42', {muted: true}))

    const row = name.closest('tr')!
    fireEvent.click(within(row).getByRole('button', {name: /Expand row/}))
    expect(await screen.findByText('All conditions must match:')).toBeTruthy()
    expect(screen.getByText('Device name matched exactly.')).toBeTruthy()

    const results = await axe.run(container, {rules: {'color-contrast': {enabled: false}}})
    expect(results.violations).toEqual([])
  })

  it('keeps a disconnected endpoint visible and disables unsupported controls', async () => {
    api.endpointExplanation.mockResolvedValue({...explanation, resolution: {...explanation.resolution, status: 'no_match', selectedRuntimeKey: null}})
    api.endpointLevel.mockResolvedValue({value: {
      ...level,
      availability: 'unavailable',
      runtimeVersion: null,
      capabilities: {volume: {readable: false, writable: false}, mute: {readable: false, writable: false}},
    }, etag: '"5"'})
    render(<ConfigProvider><DeviceDiscoveryPage/></ConfigProvider>)

    expect(await screen.findByText('Main speakers')).toBeTruthy()
    expect(screen.getByText('unavailable')).toBeTruthy()
    expect((screen.getByRole('slider', {name: 'Main speakers level'}) as HTMLInputElement).getAttribute('aria-disabled')).toBe('true')
    expect((screen.getByRole('button', {name: 'Mute Main speakers'}) as HTMLButtonElement).disabled).toBe(true)
  })
})
