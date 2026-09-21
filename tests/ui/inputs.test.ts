/**
 * The leaf input helpers (`src/ui/inputs.ts`): the parsing every editor field does between the
 * text a user types and the numbers the schema will accept. `clampField` is covered through the
 * editor's own suite; `parseIntList` is pinned here, because the whole reason it exists is that
 * `Number` is too generous for a field whose value ends up in a scenario.
 */
import { describe, it, expect } from 'vitest'
import { parseEpc, parseIntList } from '../../src/ui/inputs'

describe('parseIntList', () => {
  it('reads a comma-separated list, with the spacing the user chose', () => {
    expect(parseIntList('100,150,200,210', 0, 249, 250)).toEqual([100, 150, 200, 210])
    expect(parseIntList(' 3 ', 0, 249, 250)).toEqual([3])
    expect(parseIntList('0, 49,50 , 249', 0, 249, 250)).toEqual([0, 49, 50, 249])
    // order is the user's, not sorted
    expect(parseIntList('9,1,5', 0, 249, 250)).toEqual([9, 1, 5])
  })

  it('refuses what Number would silently accept', () => {
    // Number('') is 0, Number('1e2') is 100, Number('0x10') is 16 — none of them were typed.
    for (const bad of ['', '   ', '3,,4', '3.5', '-1', '1e2', '0x10', '+3', 'x', '3, x']) {
      expect(parseIntList(bad, 0, 249, 250), bad).toBeNull()
    }
  })

  it('enforces the bounds, the length cap and distinctness', () => {
    expect(parseIntList('249', 0, 249, 250)).toEqual([249])
    expect(parseIntList('250', 0, 249, 250)).toBeNull()
    expect(parseIntList('0', 1, 9, 4)).toBeNull()
    expect(parseIntList('3,3', 0, 249, 250)).toBeNull()
    expect(parseIntList('1,2,3', 0, 9, 3)).toEqual([1, 2, 3])
    expect(parseIntList('1,2,3,4', 0, 9, 3)).toBeNull()
  })

  it('never returns an empty list, so a field that commits one cannot blank the scenario', () => {
    // `''.split(',')` is `['']`, not `[]` — the one case where a length check alone would pass.
    expect(parseIntList('', 0, 9, 4)).toBeNull()
    expect(parseIntList(',', 0, 9, 4)).toBeNull()
  })
})

describe('parseEpc', () => {
  it('blank (or whitespace-only) clears the field, so the schema derives one from the node id', () => {
    expect(parseEpc('')).toBeUndefined()
    expect(parseEpc('   ')).toBeUndefined()
  })

  it('a valid 24-hex-character EPC commits lower-cased, matching epcOf\'s own case', () => {
    expect(parseEpc('0123456789ABCDEF01234567')).toBe('0123456789abcdef01234567')
    expect(parseEpc('0123456789abcdef01234567')).toBe('0123456789abcdef01234567')
    expect(parseEpc('  0123456789abcdef01234567  ')).toBe('0123456789abcdef01234567') // trimmed
  })

  it('anything else does not parse, so the caller keeps the field on screen', () => {
    for (const bad of ['0123', '0123456789abcdef0123456', '0123456789abcdef012345678', 'zzz456789abcdef01234567', '0123-456789abcdef012345']) {
      expect(parseEpc(bad), bad).toBeNull()
    }
  })
})
