// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import axe from 'axe-core'
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest'
import type {CurrentPlanDto, RuntimeExplanationPresentationDto} from '@open-cinema/shared'
import {PlanExplanation} from './PlanExplanation'

const presentation: RuntimeExplanationPresentationDto = {
  schemaVersion: 1,
  headline: {status: 'active', title: 'TV is playing on the headset', summary: 'The connected headset has priority over the main speakers.'},
  route: [
    {kind: 'endpoint', name: 'Television', role: 'source', detail: 'PCM stereo', referenceId: 'tv', nodeId: 'input'},
    {kind: 'processor', name: 'Adaptive decoder', role: 'decode', detail: 'PCM bypass', referenceId: 'decoder', nodeId: 'decoder'},
    {kind: 'processor', name: 'CamillaDSP', role: 'process', detail: 'Headphone profile', referenceId: 'dsp', nodeId: 'dsp'},
    {kind: 'endpoint', name: 'Bluetooth headset', role: 'output', detail: 'Connected', referenceId: 'headset', nodeId: 'output'},
  ],
  selection: {trigger: 'Headset connected', winner: 'Bluetooth headset', winnerReferenceId: 'headset', reasonCode: 'priority', reason: 'The headset is the first available preferred output.', selectorNodeId: 'selector'},
  alternatives: [{name: 'Main speakers', referenceId: 'speakers', status: 'not-selected', reasonCode: 'lower-priority', reason: 'Available, but below the headset in output priority.', technicalEvidence: ['candidate:2'], selectorNodeId: 'selector', role: 'output'}],
  signals: {input: {content: 'pcm', channels: 2}, path: [{edgeId: 'edge-1', fromNodeId: 'input', toNodeId: 'decoder', from: 'Television', to: 'Adaptive decoder', signal: {content: 'pcm', channels: 2}, changes: {}, compatible: true}]},
  processors: [{kind: 'processor', name: 'CamillaDSP', role: 'process', detail: 'Headphone profile', referenceId: 'dsp', nodeId: 'dsp'}],
  overrides: [],
  transition: {status: 'converged', durationMs: 420, observedAt: '2026-08-28T20:00:00Z', message: 'The old speaker route was removed after the headset path was ready.'},
  errors: [{stage: 'processor', path: '$.nodes[2]', code: 'profile-fallback', message: 'Requested cinema profile was unavailable.', severity: 'warning', nextStep: 'Select an installed CamillaDSP profile.'}],
  technicalReferences: {planId: 'plan-secret-id'},
}

const current: CurrentPlanDto = {
  definitionId: 'graph-1',
  applied: {status: 'converged', currentPlanId: 'plan-1', previousPlanId: null, transitionGeneration: 2, correlationId: 'correlation-1', lastError: null, updatedAt: '2026-08-28T20:00:00Z'},
  plan: {
    id: 'plan-1',
    schemaVersion: 1,
    definitionId: 'graph-1',
    revisionId: 'revision-1',
    desiredStateVersion: 4,
    worldGeneration: 8,
    worldSequence: 20,
    runtimeVersion: '8:20',
    resolutionMode: 'live',
    status: 'resolved',
    document: {},
    explanation: {presentation},
    planDigest: 'a'.repeat(64),
    correlationId: 'correlation-1',
    applied: {status: 'converged', currentPlanId: 'plan-1', previousPlanId: null, transitionGeneration: 2, correlationId: 'correlation-1', lastError: null, updatedAt: '2026-08-28T20:00:00Z'},
    createdAt: '2026-08-28T20:00:00Z',
  },
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()})),
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {writable: true, value: class { observe() {} unobserve() {} disconnect() {} }})
})

afterEach(cleanup)

describe('PlanExplanation', () => {
  it('explains the route in human sections and keeps identifiers under technical details', async () => {
    const {container} = render(<PlanExplanation current={current}/>)

    expect(screen.getByText('TV is playing on the headset')).toBeTruthy()
    expect(screen.getByText('Why this route')).toBeTruthy()
    expect(screen.getByText('Main speakers')).toBeTruthy()
    expect(screen.getByText('The headset is the first available preferred output.')).toBeTruthy()
    expect(screen.getByText('Select an installed CamillaDSP profile.')).toBeTruthy()
    expect(screen.queryByText('plan-secret-id')).toBeNull()
    fireEvent.click(screen.getByText('Technical details'))
    expect(await screen.findByText(/plan-secret-id/)).toBeTruthy()

    const results = await axe.run(container, {rules: {'color-contrast': {enabled: false}}})
    expect(results.violations).toEqual([])
  })
})
