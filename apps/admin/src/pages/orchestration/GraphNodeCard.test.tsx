// @vitest-environment jsdom

import {fireEvent, render, screen} from '@testing-library/react'
import {ReactFlowProvider, type NodeProps} from 'reactflow'
import {beforeAll, describe, expect, it, vi} from 'vitest'
import type {NodeTypeDto} from '@open-cinema/shared'
import {GraphNodeCard, type GraphNodeData} from './GraphNodeCard'

const definition: NodeTypeDto = {
  id: 'core.mixer-intent',
  version: 1,
  displayName: 'Mixer intent',
  category: 'processing',
  description: 'Mixes multiple PCM inputs into one output.',
  ports: [],
  configurationSchema: {type: 'object', properties: {}},
  requiresSubgraphReference: false,
  allowsDynamicPorts: false,
  allowsFeedback: false,
  available: true,
  source: 'core',
  pluginId: null,
  ui: {advanced: false, paletteGroup: 'Processing', icon: 'mixer'},
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()})),
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {writable: true, value: class { observe() {} unobserve() {} disconnect() {} }})
})

describe('GraphNodeCard', () => {
  it('shows concise node help from an accessible information control', async () => {
    const onSelect = vi.fn()
    const data: GraphNodeData = {
      graphNode: {id: 'mixer', type: definition.id, version: 1, configuration: {}, layout: {x: 0, y: 0}},
      definition,
      issues: [],
      resolved: false,
      observed: false,
      dirty: false,
      editable: true,
      onSelect,
    }
    const props = {data, selected: false} as unknown as NodeProps<GraphNodeData>
    render(<ReactFlowProvider><GraphNodeCard {...props}/></ReactFlowProvider>)

    const information = screen.getByRole('button', {name: 'About Mixer intent'})
    fireEvent.focus(information)
    expect(onSelect).toHaveBeenCalledWith('mixer')
    fireEvent.mouseEnter(information)
    expect(await screen.findByText(definition.description)).toBeTruthy()
  })
})
