// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import axe from 'axe-core'
import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest'
import type {GraphNodeDto, LogicalEndpointDto, NodeTypeDto} from '@open-cinema/shared'
import {GraphNodeInspector} from './GraphNodeInspector'

const definition: NodeTypeDto = {
  id: 'processor.decoder',
  version: 1,
  displayName: 'Adaptive decoder',
  category: 'processing',
  description: 'Detect and decode encoded audio.',
  ports: [],
  configurationSchema: {
    type: 'object',
    properties: {
      encodedBehavior: {type: 'string', enum: ['decode', 'error'], description: 'What to do with encoded input.'},
      minimumConfidence: {type: 'number', minimum: 0, maximum: 1},
      supportedCodecs: {type: 'array', items: {type: 'string', enum: ['ac3', 'dts']}},
      resourcePriority: {type: 'object', additionalProperties: {type: 'string'}},
    },
  },
  requiresSubgraphReference: false,
  allowsDynamicPorts: false,
  allowsFeedback: false,
  available: true,
  source: 'core',
  pluginId: null,
  ui: {advanced: false, paletteGroup: 'Processing', icon: 'decoder'},
}

const node: GraphNodeDto = {
  id: 'decoder',
  type: definition.id,
  version: 1,
  configuration: {encodedBehavior: 'decode', minimumConfidence: 0.7, supportedCodecs: ['ac3'], resourcePriority: {}},
  layout: {x: 10, y: 20},
}

const selectorDefinition: NodeTypeDto = {
  ...definition,
  id: 'core.ordered-selector',
  displayName: 'Ordered selector',
  category: 'routing',
  description: 'Chooses the highest-priority eligible endpoint in declared order.',
  configurationSchema: {
    type: 'object',
    properties: {
      mode: {enum: ['exclusive', 'first-available']},
      tieBreak: {enum: ['declaration-order', 'reference-id', 'conflict']},
      candidates: {
        type: 'array',
        items: {type: 'object'},
      },
    },
  },
}

const endpoints: LogicalEndpointDto[] = [
  ['phone', 'Bluetooth programme', 'input'],
  ['tv', 'TV SPDIF', 'input'],
  ['speakers', 'Main speakers', 'output'],
  ['headset', 'Headset', 'output'],
].map(([id, name, direction]) => ({
  id,
  name,
  direction: direction as 'input' | 'output',
  ownerId: 'owner',
  selector: {version: 1, match: 'all', predicates: []},
  tags: [],
  groups: [],
  policyMetadata: {},
  explicitBinding: null,
  lastKnown: {},
  updateVersion: 1,
  createdAt: '2026-08-29T00:00:00Z',
  updatedAt: '2026-08-29T00:00:00Z',
}))

const selectorNode: GraphNodeDto = {
  id: 'programme-selector',
  type: selectorDefinition.id,
  version: 1,
  configuration: {
    mode: 'first-available',
    tieBreak: 'declaration-order',
    candidates: [
      {
        endpoint: 'phone',
        priority: 200,
        eligibleWhen: {
          op: 'all',
          args: [
            {op: 'eq', fact: 'endpoint.phone.availability', value: 'route-available'},
            {op: 'eq', fact: 'endpoint.phone.activeSignal', value: true},
          ],
        },
        unknownResult: 'ineligible',
      },
      {endpoint: 'tv', priority: 100},
    ],
  },
  layout: {x: 10, y: 20},
}

const conditionalDefinition: NodeTypeDto = {
  ...definition,
  id: 'core.conditional-bypass',
  displayName: 'Conditional bypass',
  category: 'control',
  description: 'Uses a processed path when a safe live condition is true.',
  configurationSchema: {
    type: 'object',
    properties: {
      condition: {type: 'object', properties: {op: {type: 'string'}}},
      unknownResult: {enum: ['bypass', 'processed', 'waiting', 'error']},
    },
  },
}

const conditionalNode: GraphNodeDto = {
  id: 'bypass',
  type: conditionalDefinition.id,
  version: 1,
  configuration: {
    condition: {op: 'exists', fact: 'endpoint.tv.availability'},
    unknownResult: 'bypass',
  },
  layout: {x: 10, y: 20},
}

const pluginSourceDefinition: NodeTypeDto = {
  ...definition,
  id: 'open-cinema.librespot.source',
  displayName: 'Spotify Connect source',
  configurationSchema: {
    type: 'object',
    properties: {
      instanceId: {
        type: 'string',
        'x-open-cinema-widget': 'plugin-instance-select',
        'x-open-cinema-plugin': 'open-cinema.librespot',
        'x-open-cinema-capability': 'open-cinema.librespot.sources',
      },
    },
  },
}

const pluginSourceNode: GraphNodeDto = {
  id: 'spotify-source',
  type: pluginSourceDefinition.id,
  version: 1,
  configuration: {},
  layout: {x: 10, y: 20},
}

const managedSourceEndpoint: LogicalEndpointDto = {
  ...endpoints[0],
  id: 'spotify-endpoint',
  name: 'Living room Spotify',
  policyMetadata: {
    managedSource: true,
    pluginId: 'open-cinema.librespot',
    capabilityId: 'open-cinema.librespot.sources',
    instanceId: 'spotify-instance-1',
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

describe('GraphNodeInspector', () => {
  it('uses structured controls and keeps destructive actions confirmed', async () => {
    const onChange = vi.fn()
    const onRemove = vi.fn()
    const {container} = render(
      <GraphNodeInspector
        node={node}
        definition={definition}
        endpoints={[]}
        profiles={[]}
        issues={[]}
        editable
        onChange={onChange}
        onRemove={onRemove}
      />,
    )

    expect(screen.getByRole('combobox', {name: 'Encoded Behavior'})).toBeTruthy()
    expect(screen.getByRole('spinbutton', {name: 'Minimum Confidence'})).toBeTruthy()
    expect(screen.getByText('Add entry')).toBeTruthy()
    expect(screen.queryByRole('button', {name: /Save/})).toBeNull()
    expect(screen.queryByRole('button', {name: /Reload/})).toBeNull()

    fireEvent.change(screen.getByRole('spinbutton', {name: 'Minimum Confidence'}), {target: {value: '0.9'}})
    expect(onChange).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', {name: /Delete/}))
    expect(onRemove).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', {name: 'Delete'}))
    expect(onRemove).toHaveBeenCalledWith('decoder')

    const results = await axe.run(container, {rules: {'color-contrast': {enabled: false}}})
    expect(results.violations).toEqual([])
  })

  it('edits ordered device candidates without exposing the common policy as JSON', async () => {
    const onChange = vi.fn()
    render(
      <GraphNodeInspector
        node={selectorNode}
        definition={selectorDefinition}
        endpoints={endpoints}
        profiles={[]}
        issues={[]}
        editable
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', {name: 'Candidate 1 device'})).toBeTruthy()
    expect(screen.getByRole('spinbutton', {name: 'Candidate 1 priority'})).toBeTruthy()
    expect(screen.getByText('When route is available and playing')).toBeTruthy()
    expect(screen.getByText('When device is connected')).toBeTruthy()
    expect(screen.queryByText('Advanced JSON')).toBeNull()
    expect(screen.queryByText('Advanced condition JSON')).toBeNull()

    fireEvent.click(screen.getByRole('button', {name: 'Move candidate 2 up'}))
    const reordered = onChange.mock.lastCall?.[0] as GraphNodeDto
    expect((reordered.configuration.candidates as Array<{endpoint: string}>).map((candidate) => candidate.endpoint)).toEqual(['tv', 'phone'])

    fireEvent.mouseDown(screen.getByRole('combobox', {name: 'Candidate 1 device'}))
    fireEvent.click(await screen.findByText('Headset'))
    const changed = onChange.mock.lastCall?.[0] as GraphNodeDto
    expect((changed.configuration.candidates as Array<{endpoint: string}>)[0].endpoint).toBe('headset')
    expect(JSON.stringify(changed.configuration.candidates)).toContain('endpoint.headset.activeSignal')
  })

  it('edits conditional rules with named controls instead of a raw op field', async () => {
    const onChange = vi.fn()
    render(
      <GraphNodeInspector
        node={conditionalNode}
        definition={conditionalDefinition}
        endpoints={endpoints}
        profiles={[]}
        nodes={[conditionalNode]}
        definitions={[conditionalDefinition]}
        parameters={[]}
        issues={[]}
        editable
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox', {name: 'Condition type'})).toBeTruthy()
    expect(screen.getByRole('combobox', {name: 'Condition fact'})).toBeTruthy()
    expect(screen.queryByRole('textbox', {name: 'Op'})).toBeNull()
    expect(screen.getByText('Use original bypass path')).toBeTruthy()

    fireEvent.mouseDown(screen.getByRole('combobox', {name: 'Condition type'}))
    fireEvent.click(await screen.findByText('Equals'))
    const changed = onChange.mock.lastCall?.[0] as GraphNodeDto
    expect((changed.configuration.condition as {op: string}).op).toBe('eq')
  })

  it('selects live plugin source instances without an ID or JSON text field', async () => {
    const onChange = vi.fn()
    render(
      <GraphNodeInspector
        node={pluginSourceNode}
        definition={pluginSourceDefinition}
        endpoints={[managedSourceEndpoint]}
        profiles={[]}
        issues={[]}
        editable
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    )

    fireEvent.mouseDown(screen.getByRole('combobox', {name: 'Instance'}))
    fireEvent.click(await screen.findByText('Living room Spotify'))
    const changed = onChange.mock.lastCall?.[0] as GraphNodeDto
    expect(changed.configuration.instanceId).toBe('spotify-instance-1')
    expect(screen.queryByText('Advanced JSON')).toBeNull()
    expect(screen.queryByRole('textbox', {name: 'Instance Id'})).toBeNull()
  })
})
