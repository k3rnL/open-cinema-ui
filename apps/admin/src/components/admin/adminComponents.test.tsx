// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { ConfigProvider } from 'antd'
import axe from 'axe-core'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  CapabilityAction,
  MetricSparkline,
  StableStatusRegion,
  ValueWithFreshness,
} from '.'

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
})

afterEach(cleanup)

describe('admin UI foundations', () => {
  it('keeps a reserved polite status region mounted across states', () => {
    const { rerender } = render(<StableStatusRegion minHeight={80} />)
    const region = screen.getByLabelText('Page status')
    expect(region.style.minHeight).toBe('80px')

    rerender(
      <StableStatusRegion
        minHeight={80}
        status={{ type: 'error', message: 'Could not refresh' }}
      />,
    )
    expect(screen.getByLabelText('Page status')).toBe(region)
    expect(screen.getByText('Could not refresh')).toBeTruthy()
  })

  it('renders unavailable actions as disabled capabilities', () => {
    render(
      <CapabilityAction
        action={{ id: 'restart', label: 'Restart', available: false, reason: 'Read only' }}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Restart' }).hasAttribute('disabled')).toBe(true)
  })

  it('bounds and describes metric history without a chart dependency', () => {
    render(
      <ConfigProvider>
        <MetricSparkline
          label="CPU"
          values={[...Array.from({ length: 70 }, (_, index) => index), -10, 200, Number.NaN]}
        />
      </ConfigProvider>,
    )
    const chart = screen.getByRole('img', { name: /CPU:/ })
    const points = chart.querySelector('polyline')?.getAttribute('points')?.split(' ') ?? []
    expect(points).toHaveLength(60)
    expect(chart.getAttribute('aria-label')).toContain('60 recent samples')
  })

  it('uses accessible Ant Design primitives for freshness values', async () => {
    const { container } = render(
      <ConfigProvider>
        <ValueWithFreshness value="4.1.3" observedAt="2026-08-28T12:00:00Z" />
      </ConfigProvider>,
    )
    expect(screen.getByText('Current')).toBeTruthy()
    expect((await axe.run(container)).violations).toEqual([])
  })
})
