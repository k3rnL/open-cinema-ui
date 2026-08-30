import {describe, expect, it} from 'vitest'
import {InvalidPluginUIContractError, parsePluginUIBootstrap} from '../src/plugins'

function bootstrap(template = 'settings', widget = 'text') {
  return {
    schemaVersion: 1,
    plugins: [{
      id: 'test.plugin',
      displayName: 'Test plugin',
      version: '1.0.0',
      health: 'healthy',
      descriptor: {
        schemaVersion: 1,
        navigation: [{id: 'test.plugin.navigation', label: 'Test', pageId: 'test.plugin.settings', order: 10}],
        pages: [{
          id: 'test.plugin.settings',
          title: 'Settings',
          template,
          binding: {read: '/api/plugins/test.plugin/settings'},
          sections: [{
            id: 'test.plugin.general',
            title: 'General',
            presentation: 'card',
            fields: [{id: 'test.plugin.name', path: '/name', label: 'Name', widget}],
          }],
          actions: [{
            id: 'test.plugin.restart',
            label: 'Restart',
            method: 'POST',
            endpoint: '/api/plugins/test.plugin/restart',
            confirmation: 'confirm',
            lifecycleImpact: 'hot',
            available: true,
          }],
        }],
      },
    }],
  }
}

describe('plugin UI contract', () => {
  it('accepts bounded product-owned templates and widgets', () => {
    const parsed = parsePluginUIBootstrap(bootstrap())
    expect(parsed.plugins[0].descriptor.pages[0].template).toBe('settings')
  })

  it('fails closed for unknown templates and widgets', () => {
    expect(() => parsePluginUIBootstrap(bootstrap('remote-react'))).toThrow(InvalidPluginUIContractError)
    expect(() => parsePluginUIBootstrap(bootstrap('settings', 'json-editor'))).toThrow(InvalidPluginUIContractError)
  })

  it('rejects navigation that points outside the declared pages', () => {
    const value = bootstrap()
    value.plugins[0].descriptor.navigation[0].pageId = 'test.plugin.missing'
    expect(() => parsePluginUIBootstrap(value)).toThrow(/unknown page/)
  })
})
