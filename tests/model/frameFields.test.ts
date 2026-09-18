import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { ampAckFrame, ampRespFrame, ampTriggerFrame } from '../../src/engine/amp'
import { Simulation } from '../../src/engine/simulation'
import { hasFeature } from '../../src/model/caps'
import { decodeFrame, type DecodeCtx, type DecodedFrame, type FrameField } from '../../src/model/frameFields'
import type { FrameDesc, FrameKind } from '../../src/model/frames'
import type { Scenario } from '../../src/model/scenario'

const MS = 1_000_000

interface Sample { frame: FrameDesc; ctx: DecodeCtx; lesson: string }

function framesOf(lessonId: string, ms: number): Sample[] {
  const sc: Scenario = LESSONS.find((l) => l.id === lessonId)!.scenario()
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  const byId = new Map(sc.nodes.map((n) => [n.id, n]))
  const sim = new Simulation(sc)
  const out: Sample[] = []
  for (let t = 50 * MS; t <= ms * MS; t += 50 * MS) {
    for (const r of sim.runUntil(t).records) {
      if (r.type !== 'TX_START') continue
      const src = byId.get(r.frame.src) ?? ap
      out.push({ frame: r.frame, lesson: lessonId, ctx: { apId: ap.id, isEdca: hasFeature(src, 'edca') && hasFeature(ap, 'edca') } })
    }
  }
  return out
}

const LESSON_IDS = ['airtime', 'hidden', 'edca', 'ampdu', 'txop-protect', 'ofdma-dl', 'ofdma-ul', 'mumimo']
const samples = LESSON_IDS.flatMap((id) => framesOf(id, 300))

const field = (d: DecodedFrame, key: FrameField['key']) => d.users[0].subframes[0].mpdu.fields.find((f) => f.key === key)
const fcBit = (d: DecodedFrame, key: string) => field(d, 'fc')!.bits!.find((b) => b.key === key)!.value

describe('decodeFrame over recorded frames', () => {
  it('covers every frame kind, A-MPDUs, DL MU and TB PPDUs', () => {
    const kinds = new Set<FrameKind>(samples.map((s) => s.frame.kind))
    for (const k of ['data', 'ack', 'ba', 'rts', 'cts', 'trigger', 'mba', 'cfend'] as FrameKind[]) {
      expect(kinds.has(k), k).toBe(true)
    }
    expect(samples.some((s) => s.frame.ampdu && !s.frame.orthogonalGroup)).toBe(true)
    expect(samples.some((s) => s.frame.kind === 'data' && s.frame.muParts)).toBe(true)
    expect(samples.some((s) => s.frame.kind === 'data' && s.frame.orthogonalGroup && !s.frame.muParts)).toBe(true)
    expect(samples.some((s) => s.frame.kind === 'data' && !s.frame.ampdu && !s.frame.muParts)).toBe(true)
  })

  it('field byte counts sum to frame.bytes', () => {
    for (const { frame, ctx, lesson } of samples) {
      const d = decodeFrame(frame, ctx)
      const fieldSum = d.users.reduce((s, u) => s + u.subframes.reduce(
        (t, sf) => t + sf.delimiterBytes + sf.padBytes + sf.mpdu.fields.reduce((a, f) => a + f.bytes, 0), 0), 0)
      expect(fieldSum, `${lesson} ${frame.kind} ${frame.src}→${frame.dst}`).toBe(frame.bytes)
      expect(d.bytes).toBe(frame.bytes)
    }
  })

  it('PPDU segment durations sum to frame.txTimeNs', () => {
    for (const { frame, ctx, lesson } of samples) {
      const d = decodeFrame(frame, ctx)
      const total = d.ppdu.reduce((s, p) => s + p.durNs, 0)
      expect(total, `${lesson} ${frame.kind}`).toBe(frame.txTimeNs)
      for (const p of d.ppdu) expect(p.durNs).toBeGreaterThanOrEqual(0)
    }
  })

  it('non-HT frames: 16 µs preamble, 4 µs SIGNAL, 4 µs symbols', () => {
    const ack = samples.find((s) => s.frame.kind === 'ack')!
    const d = decodeFrame(ack.frame, ack.ctx)
    expect(d.ppdu.map((p) => p.key)).toEqual(['legacyPreamble', 'signal', 'data'])
    expect(d.ppdu[0].durNs).toBe(16_000)
    expect(d.ppdu[1].durNs).toBe(4_000)
    expect(d.ppdu[2].symNs).toBe(4_000)
  })

  it('uplink data: To DS, RA = BSSID = AP, TA = SA = station', () => {
    const s = samples.find((x) => x.frame.kind === 'data' && x.frame.dst === x.ctx.apId && !x.frame.muParts)!
    const d = decodeFrame(s.frame, s.ctx)
    expect(fcBit(d, 'toDs')).toBe('1')
    expect(fcBit(d, 'fromDs')).toBe('0')
    expect(field(d, 'addr1')).toMatchObject({ node: s.ctx.apId, roles: ['RA', 'BSSID'] })
    expect(field(d, 'addr2')).toMatchObject({ node: s.frame.src, roles: ['TA', 'SA'] })
    expect(field(d, 'fcs')!.bytes).toBe(4)
  })

  it('downlink data: From DS, RA = DA = station, TA = BSSID = AP', () => {
    const s = samples.find((x) => x.frame.kind === 'data' && x.frame.src === x.ctx.apId && !x.frame.muParts)!
    const d = decodeFrame(s.frame, s.ctx)
    expect(fcBit(d, 'toDs')).toBe('0')
    expect(fcBit(d, 'fromDs')).toBe('1')
    expect(field(d, 'addr1')).toMatchObject({ node: s.frame.dst, roles: ['RA', 'DA'] })
    expect(field(d, 'addr2')).toMatchObject({ node: s.ctx.apId, roles: ['TA', 'BSSID'] })
  })

  it('legacy DCF data has a 24-octet header and no QoS Control; EDCA data carries TID from the AC', () => {
    const legacy = samples.find((x) => !x.ctx.isEdca && x.frame.kind === 'data')!
    const dl = decodeFrame(legacy.frame, legacy.ctx)
    expect(legacy.ctx.isEdca).toBe(false)
    expect(field(dl, 'qos')).toBeUndefined()
    expect(dl.users[0].subframes[0].mpdu.subtypeName).toBe('Data')
    const qos = samples.find((x) => x.frame.kind === 'data' && x.ctx.isEdca && x.frame.ac === 3)
      ?? samples.find((x) => x.frame.kind === 'data' && x.ctx.isEdca && x.frame.ac !== undefined)!
    const dq = decodeFrame(qos.frame, qos.ctx)
    expect(dq.users[0].subframes[0].mpdu.subtypeName).toBe('QoS Data')
    expect(field(dq, 'qos')!.value).toContain(`TID ${[1, 0, 5, 6][qos.frame.ac!]}`)
  })

  it('A-MPDU: one subframe per MSDU, delimiters, padding only between subframes, implicit BAR', () => {
    const s = samples.find((x) => x.frame.ampdu && x.frame.ampdu.mpduCount > 2 && !x.frame.orthogonalGroup)!
    const d = decodeFrame(s.frame, s.ctx)
    const sf = d.users[0].subframes
    expect(sf).toHaveLength(s.frame.ampdu!.mpduCount)
    for (const x of sf) expect(x.delimiterBytes).toBe(4)
    expect(sf[sf.length - 1].padBytes).toBe(0)
    for (const x of sf.slice(0, -1)) expect((x.mpdu.bytes + x.padBytes) % 4).toBe(0)
    expect(field(d, 'qos')!.value).toContain('Implicit BAR')
  })

  it('control frames: ACK/CTS carry only RA, RTS carries RA and TA, both DS bits 0', () => {
    for (const kind of ['ack', 'cts', 'rts'] as const) {
      const s = samples.find((x) => x.frame.kind === kind)!
      const d = decodeFrame(s.frame, s.ctx)
      const mpdu = d.users[0].subframes[0].mpdu
      expect(mpdu.typeName).toBe('Control')
      expect(fcBit(d, 'toDs')).toBe('0')
      expect(fcBit(d, 'fromDs')).toBe('0')
      const addrs = mpdu.fields.filter((f) => f.key.startsWith('addr'))
      expect(addrs.map((a) => a.roles![0])).toEqual(kind === 'rts' ? ['RA', 'TA'] : ['RA'])
      expect(addrs[0].node).toBe(s.frame.dst)
    }
  })

  it('DL MU PPDU: one PSDU per user and a SIG-B/EHT-SIG segment', () => {
    const s = samples.find((x) => x.frame.kind === 'data' && x.frame.muParts)!
    const d = decodeFrame(s.frame, s.ctx)
    expect(d.users.map((u) => u.dst)).toEqual(s.frame.muParts!.map((p) => p.dst))
    expect(d.ppdu.some((p) => p.key === 'muSig')).toBe(true)
  })

  it('reports the Retry bit from the recorded frame', () => {
    const s = samples.find((x) => x.frame.kind === 'data' && x.frame.retryFlag && !x.frame.muParts)
    if (!s) return
    expect(fcBit(decodeFrame(s.frame, s.ctx), 'retry')).toBe('1')
  })
})

describe('AMP frames decode to their P802.11bp fields and PPDU layout', () => {
  const ctx = { apId: 'ap', isEdca: true }
  it('trigger: FC 1, ID 2, TDC 2, body 6, FCS 2 = 13 octets; PPDU segments sum to TXTIME', () => {
    const f = ampTriggerFrame({ src: 'ap', dlKbps: 250, ulKbps: 250, phase: 'random', slots: 4, slotNs: 272_000, acwe: 2, sessionId: 1, staIds: [], reading: false, roundNs: 0, signalExtNs: 6_000 })
    const d = decodeFrame(f, ctx)
    const fields = d.users[0].subframes[0].mpdu.fields
    expect(fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['ampTdc', 2], ['body', 6], ['fcs', 2]])
    expect(d.bytes).toBe(13)
    expect(d.ppdu.map((s) => s.key)).toEqual(['legacyPreamble', 'signal', 'usig', 'ampSync', 'ampSig', 'ampData', 'padding', 'signalExt'])
    expect(d.ppdu.reduce((s, x) => s + x.durNs, 0)).toBe(f.txTimeNs)
    expect(d.ppdu.find((s) => s.key === 'ampSig')!.durNs).toBe(64_000)
  })
  it('scheduled trigger lists STA ids; Ack is 4 octets with an 8-bit CRC; response carries its reading', () => {
    const t = ampTriggerFrame({ src: 'ap', dlKbps: 1000, ulKbps: 1000, phase: 'scheduled', slots: 2, slotNs: 132_000, acwe: 0, sessionId: 1, staIds: ['tag-1', 'tag-2'], reading: true, roundNs: 0, signalExtNs: 6_000 })
    expect(decodeFrame(t, ctx).users[0].subframes[0].mpdu.fields.find((x) => x.key === 'ampStaList')).toMatchObject({ bytes: 4 })
    const a = decodeFrame(ampAckFrame('ap', 'tag-1', 250, 2, 6_000), ctx)
    expect(a.users[0].subframes[0].mpdu.fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['fcs', 1]])
    const r = decodeFrame(ampRespFrame('tag-1', 'ap', 250, 2, 1, true), ctx)
    expect(r.users[0].subframes[0].mpdu.fields.map((x) => [x.key, x.bytes])).toEqual([['fc', 1], ['ampId', 2], ['ampTdc', 2], ['body', 8], ['fcs', 2]])
    expect(r.ppdu.map((s) => s.key)).toEqual(['ampSync', 'ampData'])
    expect(r.ppdu[0].durNs).toBe(48_000)
  })
})
