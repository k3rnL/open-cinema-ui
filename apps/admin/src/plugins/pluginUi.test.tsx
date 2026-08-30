// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {ConfigProvider} from 'antd'
import axe from 'axe-core'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {type ReactNode, useReducer} from 'react'
import {MemoryRouter, Route, Routes} from 'react-router'
import type {EnabledPluginUIDto, JsonObject, PluginFieldDto} from '@open-cinema/shared'
import {PluginField, fieldVisible, pointerValue, withPointer} from './PluginFields'
import {PluginPageErrorBoundary} from './PluginPageErrorBoundary'
import {PluginRoutePage, ResourceCollection} from './PluginPageRenderer'
import {PluginRuntimeProvider, usePluginRuntime} from './PluginRuntimeContext'

const api = vi.hoisted(() => ({ui: vi.fn()}))
const client = vi.hoisted(() => ({get: vi.fn(), request: vi.fn()}))
vi.mock('./client', () => ({pluginApi: api, pluginClient: client}))

const plugin: EnabledPluginUIDto = {
  id: 'test.plugin',
  displayName: 'Test plugin',
  version: '1.0.0',
  health: 'healthy',
  descriptor: {
    schemaVersion: 1,
    navigation: [{id: 'test.plugin.navigation', label: 'Test', pageId: 'test.plugin.settings', order: 1}],
    pages: [{
      id: 'test.plugin.settings',
      title: 'Settings',
      template: 'settings',
      binding: {read: '/api/plugins/test.plugin/settings'},
      sections: [],
    }],
  },
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    value: class {observe() {} unobserve() {} disconnect() {}},
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  api.ui.mockResolvedValue({value: {schemaVersion: 1, plugins: [plugin]}, etag: '"one"'})
  client.request.mockResolvedValue({data: {data: {id: 'source-1', displayName: 'Living room', editor: {href: '/api/plugins/test/source-1', document: {name: 'Living room', updateVersion: 2}}}}})
})

afterEach(cleanup)

function RuntimeProbe() {
  const runtime = usePluginRuntime()
  return <div>{runtime.loading ? 'Loading' : runtime.plugins.map((item) => item.displayName).join(',') || 'No plugins'}</div>
}

function Broken(): ReactNode {
  throw new Error('broken contribution')
}

describe('declarative plugin UI', () => {
  it('updates runtime navigation without blocking the surrounding application', async () => {
    render(<PluginRuntimeProvider><div>Core dashboard</div><RuntimeProbe/></PluginRuntimeProvider>)
    expect(screen.getByText('Core dashboard')).toBeTruthy()
    expect(await screen.findByText('Test plugin')).toBeTruthy()

    api.ui.mockResolvedValueOnce({value: {schemaVersion: 1, plugins: []}, etag: '"two"'})
    window.dispatchEvent(new Event('open-cinema-session-changed'))
    await waitFor(() => expect(screen.getByText('No plugins')).toBeTruthy())
  })

  it('edits typed, conditional, secret, and repeatable values without a JSON editor', async () => {
    let document: JsonObject = {
      mode: 'advanced',
      token: {configured: true},
      names: ['Living room'],
    }
    const fields: PluginFieldDto[] = [
      {id: 'test.plugin.mode', path: '/mode', label: 'Mode', widget: 'enum', choices: [{value: 'simple', label: 'Simple'}, {value: 'advanced', label: 'Advanced'}]},
      {id: 'test.plugin.delay', path: '/delay', label: 'Delay', widget: 'duration', visibleWhen: {path: '/mode', equals: 'advanced'}},
      {id: 'test.plugin.token', path: '/token', label: 'Token', widget: 'secret'},
      {id: 'test.plugin.names', path: '/names', label: 'Names', widget: 'repeatable', item: {id: 'test.plugin.name-item', path: '/value', label: 'Name', widget: 'text'}},
    ]
    function Fixture() {
      const [, rerender] = useReducer((value) => value + 1, 0)
      return <>{fields.map((field) => <PluginField key={field.id} field={field} document={document} onChange={(next) => {document = next; rerender()}}/>)}</>
    }
    const {container} = render(<ConfigProvider><Fixture/></ConfigProvider>)
    expect(screen.getByLabelText('Delay')).toBeTruthy()
    expect(screen.getByText('A secret is configured.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name: 'Add names'}))
    expect((pointerValue(document, '/names') as unknown[]).length).toBe(2)
    expect(screen.queryByText(/JSON/i)).toBeNull()
    expect((await axe.run(container, {rules: {'color-contrast': {enabled: false}}})).violations).toEqual([])
  })

  it('evaluates simple conditions and immutable JSON pointers', () => {
    const original: JsonObject = {mode: 'simple', nested: {value: 1}}
    const changed = withPointer(original, '/nested/value', 2)
    expect(pointerValue(original, '/nested/value')).toBe(1)
    expect(pointerValue(changed, '/nested/value')).toBe(2)
    expect(fieldVisible({id: 'test.field', path: '/x', label: 'X', widget: 'text', visibleWhen: {path: '/mode', equals: 'advanced'}}, original)).toBe(false)
  })

  it('contains rendering failures inside the affected plugin page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<PluginPageErrorBoundary pluginId="test.plugin"><Broken/></PluginPageErrorBoundary>)
    expect(screen.getByText('This plugin page could not be displayed')).toBeTruthy()
    expect(screen.getByText('Core navigation and other plugins are still available.')).toBeTruthy()
  })

  it('renders managed resources in a stable typed editor drawer with advertised actions', async () => {
    const reload = vi.fn().mockResolvedValue(undefined)
    const page = {
      id: 'test.plugin.sources',
      title: 'Sources',
      template: 'resource-list' as const,
      binding: {read: '/api/plugins/test/sources'},
      sections: [{
        id: 'test.plugin.essential',
        title: 'Essential setup',
        presentation: 'card' as const,
        fields: [{id: 'test.plugin.name', path: '/name', label: 'Connect name', widget: 'text' as const}],
      }],
    }
    const document: JsonObject = {
      items: [{
        id: 'source-1',
        displayName: 'Living room',
        desiredState: 'enabled',
        observedState: 'started',
        status: 'playing',
        health: 'healthy',
        editor: {href: '/api/plugins/test/source-1', document: {name: 'Living room', updateVersion: 1}},
        actions: [{
          id: 'restart', label: 'Restart', available: true, method: 'POST',
          href: '/api/plugins/test/source-1/restart', confirmation: 'none',
          lifecycleImpact: 'hot', concurrencyToken: '1',
        }],
      }],
    }
    const {container} = render(
      <ConfigProvider><ResourceCollection page={page} document={document} reload={reload} reportError={vi.fn()}/></ConfigProvider>,
    )

    fireEvent.click(screen.getByRole('button', {name: /Manage/}))
    expect(await screen.findByRole('textbox', {name: 'Connect name'})).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name: /Restart/}))
    await waitFor(() => expect(client.request).toHaveBeenCalledWith(
      'POST', '/plugins/test/source-1/restart', {concurrencyToken: '1'},
    ))
    expect(screen.queryByText(/JSON/i)).toBeNull()
    expect((await axe.run(container, {rules: {'color-contrast': {enabled: false}}})).violations).toEqual([])
  })

  it('presents the full managed-resource state matrix without changing the page structure', async () => {
    const page = {
      id: 'test.plugin.sources',
      title: 'Sources',
      template: 'resource-list' as const,
      binding: {read: '/api/plugins/test/sources'},
      sections: [],
    }
    const states: JsonObject[] = [
      {id: 'creating', displayName: 'Creating source', status: 'creating', health: 'unknown'},
      {id: 'idle', displayName: 'Healthy idle source', status: 'idle', health: 'healthy'},
      {id: 'playing', displayName: 'Playing source', status: 'playing', health: 'healthy'},
      {id: 'disabled', displayName: 'Disabled source', status: 'stopped', health: 'healthy', desiredState: 'disabled'},
      {id: 'restarting', displayName: 'Restarting source', status: 'restarting', health: 'degraded'},
      {id: 'auth-failed', displayName: 'Authentication failed', status: 'error', health: 'failed', diagnostics: ['Spotify authorization must be renewed.']},
      {id: 'ambiguous', displayName: 'Ambiguous stream', status: 'unavailable', health: 'degraded', diagnostics: ['More than one matching PipeWire stream was observed.']},
    ]
    const reportError = vi.fn()
    const {container, rerender} = render(
      <ConfigProvider><ResourceCollection page={page} document={{items: states}} reload={vi.fn()} reportError={reportError}/></ConfigProvider>,
    )

    for (const state of states) {
      expect(screen.getByText(String(state.displayName))).toBeTruthy()
    }
    expect(screen.getAllByRole('button', {name: /Manage/})).toHaveLength(states.length)
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 375})
    window.dispatchEvent(new Event('resize'))
    expect(container.querySelector('.ant-list')).toBeTruthy()
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1440})
    window.dispatchEvent(new Event('resize'))
    expect(container.querySelector('.ant-list')).toBeTruthy()

    rerender(
      <ConfigProvider><ResourceCollection page={page} document={{items: []}} reload={vi.fn()} reportError={reportError}/></ConfigProvider>,
    )
    expect(await screen.findByText('No plugin resources yet')).toBeTruthy()
  })

  it('keeps a skeleton while plugin data is slow and contains an endpoint failure', async () => {
    client.get.mockRejectedValueOnce(new Error('fixture endpoint unavailable'))
    const {container} = render(
      <ConfigProvider>
        <MemoryRouter initialEntries={['/plugins/test.plugin/test.plugin.settings']}>
          <PluginRuntimeProvider>
            <Routes>
              <Route path="/plugins/:pluginId/:pageId" element={<PluginRoutePage/>}/>
            </Routes>
          </PluginRuntimeProvider>
        </MemoryRouter>
      </ConfigProvider>,
    )

    expect(container.querySelector('.ant-skeleton')).toBeTruthy()
    expect(await screen.findByText('Plugin data is unavailable')).toBeTruthy()
    expect(screen.getByText('fixture endpoint unavailable')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })
})
