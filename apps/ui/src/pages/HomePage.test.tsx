// @vitest-environment jsdom

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'
import HomePage from './HomePage'

describe('on-box placeholder', () => {
  it('remains an independent minimal application', () => {
    render(<HomePage/>)

    expect(screen.getByRole('heading', {name: 'Open Cinema'})).toBeTruthy()
    const volume = screen.getByRole('slider')
    fireEvent.change(volume, {target: {value: '72'}})
    expect(screen.getByText('Volume: 72%')).toBeTruthy()
  })
})
