import { describe, expect, it } from 'vitest'
import { analysisToAppearance, parseAnalysis } from './analysis'

const good = {
  breed_guess: 'Beagle',
  fur_color: '#B8743A',
  second_color: '#fff4e0',
  marking: 'socks',
  ear_type: 'floppy',
  tail_length: 'medium',
  snout_length: 'medium',
  build: 'sturdy',
  size_class: 'medium',
  leg_length: 'short',
  confidence: 0.8,
}

describe('parseAnalysis', () => {
  it('accepts a valid analysis', () => {
    expect(parseAnalysis(good)?.breed_guess).toBe('Beagle')
  })
  it.each([
    ['unknown enum', { ...good, ear_type: 'pointy' }],
    ['bad hex colour', { ...good, fur_color: 'brown' }],
    ['not an object', 'nope'],
    ['null', null],
  ])('rejects %s', (_name, value) => {
    expect(parseAnalysis(value)).toBeNull()
  })
})

describe('analysisToAppearance', () => {
  it('maps traits to model parameters', () => {
    const look = analysisToAppearance(parseAnalysis(good)!)
    expect(look).toMatchObject({
      size: 0.95,
      build: 0.8,
      legLength: 0.5,
      earType: 'floppy',
      marking: 'socks',
      furColor: '#b8743a',
    })
    expect(look.bodyLength).toBeGreaterThan(1) // short legs => slightly longer body
  })
})
