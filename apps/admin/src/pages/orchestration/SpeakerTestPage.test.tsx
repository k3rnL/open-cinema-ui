// @vitest-environment jsdom

import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import axe from 'axe-core'
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import type {SpeakerTestOverviewDto, SpeakerTestStateDto} from '@open-cinema/shared'
import {SpeakerTestPage} from './SpeakerTestPage'
import {audioApi} from './client'

vi.mock('./client', () => ({
  audioApi: {
    speakerTest: vi.fn(),
    startSpeakerTest: vi.fn(),
    stopSpeakerTest: vi.fn(),
  },
}))

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
})

afterEach(cleanup)

const inactive: SpeakerTestStateDto = {
  active: false,
  token: null,
  runtimeKey: null,
  outputName: null,
  channel: null,
  startedAt: null,
  endsAt: null,
  durationMs: null,
}

const overview: SpeakerTestOverviewDto = {
  outputs: [
    {
      runtimeKey: 'runtime:5:node:20',
      runtimeGeneration: 5,
      name: 'Main surround speakers',
      description: 'USB amplifier',
      targetName: 'alsa_output.surround',
      channels: [
        {position: 'FL', label: 'Front left'},
        {position: 'FC', label: 'Front center'},
      ],
      rate: 48000,
    },
  ],
  active: inactive,
}

describe('SpeakerTestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(audioApi.speakerTest).mockResolvedValue(overview)
    vi.mocked(audioApi.startSpeakerTest).mockResolvedValue({
      ...inactive,
      active: true,
      token: 'test-token',
      runtimeKey: 'runtime:5:node:20',
      outputName: 'Main surround speakers',
      channel: 'FC',
      startedAt: '2026-08-26T15:00:00Z',
      endsAt: '2026-08-26T15:00:02Z',
      durationMs: 2000,
    })
    vi.mocked(audioApi.stopSpeakerTest).mockResolvedValue(inactive)
  })

  it('starts the exact labelled channel and exposes Stop accessibly', async () => {
    const {container} = render(<SpeakerTestPage/>)
    const center = await screen.findByRole('button', {name: /FC · Front center/})

    fireEvent.click(center)
    await waitFor(() => expect(audioApi.startSpeakerTest).toHaveBeenCalledWith('runtime:5:node:20', 'FC'))
    expect(await screen.findByText('Testing')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name: 'Stop speaker test'}))
    await waitFor(() => expect(audioApi.stopSpeakerTest).toHaveBeenCalledOnce())

    const results = await axe.run(container, {rules: {'color-contrast': {enabled: false}}})
    expect(results.violations).toEqual([])
  })

  it('explains when no output has a reliable channel map', async () => {
    vi.mocked(audioApi.speakerTest).mockResolvedValue({outputs: [], active: inactive})
    render(<SpeakerTestPage/>)

    expect(await screen.findByText('No testable speaker output')).toBeTruthy()
    expect(screen.getByText(/known channel map/)).toBeTruthy()
  })

  it('shows an actionable discovery failure', async () => {
    vi.mocked(audioApi.speakerTest).mockRejectedValue(new Error('Runtime inventory unavailable'))
    render(<SpeakerTestPage/>)

    expect(await screen.findByText('Speaker test failed')).toBeTruthy()
    expect(screen.getByText('Runtime inventory unavailable')).toBeTruthy()
  })
})
