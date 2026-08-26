// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { CurrentPlanDto, LogicalEndpointDto } from '@open-cinema/shared'
import { PlanExplanation } from './PlanExplanation'
import { RuleEditor } from './RuleEditor'

beforeAll(() => {
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
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => 'generated-rule-id',
  })
})

afterEach(cleanup)

const endpoints: LogicalEndpointDto[] = [
  {
    id: 'tv',
    name: 'Television',
    ownerId: 'user-1',
    direction: 'input',
    selector: { version: 1, match: 'all', predicates: [] },
    tags: ['programme'],
    groups: [],
    policyMetadata: {},
    explicitBinding: null,
    lastKnown: {},
    updateVersion: 1,
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-22T00:00:00Z',
  },
  {
    id: 'speakers',
    name: 'Main speakers',
    ownerId: 'user-1',
    direction: 'output',
    selector: { version: 1, match: 'all', predicates: [] },
    tags: ['main'],
    groups: [],
    policyMetadata: {},
    explicitBinding: null,
    lastKnown: {},
    updateVersion: 1,
    createdAt: '2026-08-22T00:00:00Z',
    updatedAt: '2026-08-22T00:00:00Z',
  },
]

describe('simple orchestration editor', () => {
  it('turns an added readable rule into a desired graph without activating audio', () => {
    const onRulesChange = vi.fn()
    render(
      <RuleEditor
        graphId="graph-1"
        graphName="Cinema"
        endpoints={endpoints}
        inputEndpointId="tv"
        rules={[]}
        scene="cinema"
        supported
        editable
        onInputChange={vi.fn()}
        onRulesChange={onRulesChange}
        onSceneChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Add WHEN/ }))
    const [rules, document] = onRulesChange.mock.calls[0]
    expect(rules[0].thenEndpointId).toBe('speakers')
    expect(document.nodes[0].configuration.logicalEndpointId).toBe('tv')
    expect(screen.getByText('Plain-language preview')).toBeTruthy()
  })
})

describe('plan explanation', () => {
  it('labels desired, world, applied, decisions, and errors accessibly', async () => {
    const current: CurrentPlanDto = {
      definitionId: 'graph-1',
      applied: {
        status: 'degraded',
        currentPlanId: 'plan-1',
        previousPlanId: null,
        transitionGeneration: 7,
        correlationId: 'correlation-1',
        lastError: null,
        updatedAt: '2026-08-22T00:00:00Z',
      },
      plan: {
        id: 'plan-1',
        schemaVersion: 1,
        definitionId: 'graph-1',
        revisionId: 'revision-1',
        desiredStateVersion: 5,
        worldGeneration: 2,
        worldSequence: 8,
        runtimeVersion: '2:8',
        resolutionMode: 'live',
        status: 'degraded',
        document: {
          endpointBindings: [
            { logicalEndpointId: 'headset', runtimeKey: null, status: 'unavailable' },
          ],
          warnings: [{ code: 'endpoint_missing', endpointId: 'headset' }],
          errors: [],
          signalContracts: [],
          resourceDecisions: [],
          actionIntent: [],
        },
        explanation: {
          summary: { selectedEndpoints: ['speakers'], selectedEdges: ['edge-1'] },
          stages: [{ stage: 'endpoint-resolution', warnings: 1, errors: 0 }],
          conditionResults: [],
          selectionDecisions: [],
          overrideDecisions: [],
        },
        planDigest: 'sha256:plan',
        correlationId: 'correlation-1',
        applied: {
          status: 'degraded',
          currentPlanId: 'plan-1',
          previousPlanId: null,
          transitionGeneration: 7,
          correlationId: 'correlation-1',
          lastError: null,
          updatedAt: '2026-08-22T00:00:00Z',
        },
        createdAt: '2026-08-22T00:00:00Z',
      },
    }
    const { container } = render(<PlanExplanation current={current} />)

    expect(screen.getByText(/Desired v5, world 2:8, transition 7/)).toBeTruthy()
    expect(screen.getByText('headset: unavailable')).toBeTruthy()
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })
    expect(results.violations).toEqual([])
  })
})
