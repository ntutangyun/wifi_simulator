import { describe, it, expect } from 'vitest'
import { makeEmitter, type TLRecord } from '../../src/model/records'

describe('makeEmitter', () => {
  it('stamps monotonic seq and passes payload through', () => {
    const out: TLRecord[] = []
    const emit = makeEmitter((r) => out.push(r))
    emit({ t: 5, type: 'CCA_BUSY', node: 'a', cause: 'energy' })
    emit({ t: 5, type: 'CCA_IDLE', node: 'a' })
    emit({ t: 9, type: 'BACKOFF_DEC', node: 'b', value: 3 })
    expect(out.map((r) => r.seq)).toEqual([0, 1, 2])
    expect(out[0]).toMatchObject({ t: 5, type: 'CCA_BUSY', node: 'a', cause: 'energy' })
    expect(out[2]).toMatchObject({ type: 'BACKOFF_DEC', value: 3 })
  })
})
