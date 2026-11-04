import { describe, expect, it } from 'vitest'
import { activeActivity, WELCOME_AWAY_MS, useDog } from './store'

describe('activeActivity', () => {
  it('plays the follow-up after the first activity ends', () => {
    const a = {
      kind: 'sulk' as const,
      until: 100,
      then: { kind: 'joy' as const, until: 200 },
    }
    expect(activeActivity(a, 50).kind).toBe('sulk')
    expect(activeActivity(a, 150).kind).toBe('joy')
    expect(activeActivity(a, 250).kind).toBe('idle')
  })
})

describe('welcome', () => {
  it('ignores short absences', () => {
    useDog.setState({ activity: { kind: 'idle', until: 0 } })
    useDog.getState().welcome(WELCOME_AWAY_MS - 1)
    expect(useDog.getState().activity.kind).toBe('idle')
  })
  it('sulks first, then is overjoyed, after a long absence', () => {
    useDog.setState({ activity: { kind: 'idle', until: 0 } })
    useDog.getState().welcome(WELCOME_AWAY_MS + 1)
    const a = useDog.getState().activity
    expect(a.kind).toBe('sulk')
    expect(a.then?.kind).toBe('joy')
  })
})
