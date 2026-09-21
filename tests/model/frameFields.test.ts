import { describe, it, expect } from 'vitest'
import { LESSONS } from '../../src/course/lessons'
import { ampAckFrame, ampRespFrame, ampTriggerFrame } from '../../src/engine/amp'
import {
  AMP_BS_WRITE_T3_NS, ampBsReplyFrame, ampRfidBytes, ampRfidFrame, bstNs, crc16Epc, epcOf,
  type AmpBsUlKbps, type Gen2Cmd, type Gen2Reply,
} from '../../src/engine/ampBs'
import { Simulation } from '../../src/engine/simulation'
import { hasFeature } from '../../src/model/caps'
import { decodeFrame, type DecodeCtx, type DecodedFrame, type FrameField } from '../../src/model/frameFields'
import type { FrameDesc, FrameKind } from '../../src/model/frames'
import type { Scenario } from '../../src/model/scenario'
import { bsScenario, bsTag } from '../engine/amp-bs-helpers'

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

describe('backscatter frames decode to their EPC Gen2 fields and excitation layout', () => {
  const ctx = { apId: 'ap', isEdca: true }
  const CMDS: Gen2Cmd[] = ['query', 'queryRep', 'ack', 'read', 'write']
  const RATES: AmpBsUlKbps[] = [250, 1000]

  /** The command PPDU the AP would send for `cmd`, its BST sized for the reply it expects. */
  function rfid(cmd: Gen2Cmd, kbps: AmpBsUlKbps, wupNs: number) {
    const reply: Gen2Reply = cmd === 'ack' ? 'epc' : cmd === 'read' ? 'read' : cmd === 'write' ? 'write' : 'rn16'
    const bst = cmd === 'write' ? bstNs(reply, kbps, AMP_BS_WRITE_T3_NS) : bstNs(reply, kbps)
    return ampRfidFrame({
      src: 'ap', dst: cmd === 'query' || cmd === 'queryRep' ? '*amp' : 'tag-1', cmd, session: 1,
      q: cmd === 'query' ? 2 : undefined, slot: 1, ulKbps: kbps, wupNs, bstNs: bst,
      chargeDbm: 10, bsDbm: 0, signalExtNs: 6_000,
    })
  }

  it('every command at both uplink rates and either wake-up: segments sum to the airtime', () => {
    for (const cmd of CMDS) {
      for (const kbps of RATES) {
        for (const wupNs of [1_000_000, 2_000_000]) {
          const f = rfid(cmd, kbps, wupNs)
          const d = decodeFrame(f, ctx)
          const where = `${cmd} @ ${kbps} kb/s, WUP ${wupNs / 1e6} ms`
          expect(d.ppdu.reduce((s, x) => s + x.durNs, 0), where).toBe(f.txTimeNs)
          for (const p of d.ppdu) expect(p.durNs, `${where} · ${p.key}`).toBeGreaterThan(0)
          // Preamble, wake-up carrier, sync, command, reply carrier, extension — no AMP-SIG
          // (SFD PM-65 note) and no padding field.
          expect(d.ppdu.map((x) => x.key), where).toEqual([
            'legacyPreamble', 'signal', 'usig', 'ampWup', 'ampSync', 'ampData', 'ampBst', 'signalExt',
          ])
          expect(d.ppdu.find((x) => x.key === 'ampWup')!.durNs, where).toBe(wupNs)
          expect(d.ppdu.find((x) => x.key === 'ampBst')!.durNs, where).toBe(f.amp!.rfid!.bstNs)
          expect(d.ppdu.find((x) => x.key === 'ampSync')!.durNs, where).toBe(16_000)
          expect(d.ppdu.find((x) => x.key === 'signalExt')!.durNs, where).toBe(6_000)
        }
      }
    }
  })

  it('a command inside the TXOP has no wake-up field at all, and still sums', () => {
    for (const cmd of CMDS) {
      for (const kbps of RATES) {
        const f = rfid(cmd, kbps, 0)
        const d = decodeFrame(f, ctx)
        const where = `${cmd} @ ${kbps} kb/s`
        expect(d.ppdu.some((x) => x.key === 'ampWup'), where).toBe(false)
        expect(d.ppdu.reduce((s, x) => s + x.durNs, 0), where).toBe(f.txTimeNs)
      }
    }
    // The case the Active Tx arithmetic used to overrun by 92 µs: its fixed prefix alone
    // (32 + 80 + 64 + 20 µs) is longer than this entire PPDU.
    const qr = rfid('queryRep', 1000, 0)
    expect(qr.txTimeNs).toBe(360_000)
    expect(decodeFrame(qr, ctx).ppdu.reduce((s, x) => s + x.durNs, 0)).toBe(360_000)
  })

  it('the BST-Excitation dominates a Write and holds the 2 ms T3', () => {
    const f = rfid('write', 250, 0)
    expect(decodeFrame(f, ctx).ppdu.find((x) => x.key === 'ampBst')!.durNs).toBe(2_429_800)
    expect(f.txTimeNs).toBe(2_963_800)
  })

  it('sizes every Gen2 command and every reply, and replies lay out as sync then data', () => {
    for (const cmd of CMDS) {
      const d = decodeFrame(rfid(cmd, 250, 0), ctx)
      expect(d.users[0].subframes[0].mpdu.fields.map((x) => x.key), cmd).toEqual(['fc', 'ampId', 'ampTdc', 'body', 'fcs'])
      expect(d.bytes, cmd).toBe(ampRfidBytes(cmd))
    }
    for (const [reply, bytes] of [['rn16', 2], ['epc', 16], ['read', 13], ['write', 5]] as const) {
      const r = ampBsReplyFrame({ src: 'tag-1', dst: 'ap', reply, kbps: 250, slot: 1 })
      const d = decodeFrame(r, ctx)
      expect(d.bytes, reply).toBe(bytes)
      expect(d.ppdu.map((x) => x.key), reply).toEqual(['ampSync', 'ampData'])
      expect(d.ppdu[0].durNs, reply).toBe(48_000) // 24 chips × 2 µs
      expect(d.ppdu.reduce((s, x) => s + x.durNs, 0), reply).toBe(r.txTimeNs)
    }
    // A 1 Mb/s reply reads its own constants: 24 chips × 0.5 µs, not the Active Tx 48 × 0.25.
    expect(decodeFrame(ampBsReplyFrame({ src: 'tag-1', dst: 'ap', reply: 'epc', kbps: 1000, slot: 1 }), ctx).ppdu[0].durNs).toBe(12_000)
  })

  it('the id field decodes the tag’s configured EPC, not one derived from its node id', () => {
    const epc = 'abcdefabcdefabcdefabcdef'
    const idOf = (d: DecodedFrame) => d.users[0].subframes[0].mpdu.fields.find((x) => x.key === 'ampId')!.value
    const withEpc = decodeFrame(ampRfidFrame({
      src: 'ap', dst: 'tag-1', cmd: 'read', session: 1, slot: 1, ulKbps: 250, wupNs: 0,
      bstNs: bstNs('read', 250), chargeDbm: 10, bsDbm: 0, signalExtNs: 6_000, epc,
    }), ctx)
    expect(idOf(withEpc)).toBe(crc16Epc(epc).toString(16).padStart(4, '0'))
    expect(idOf(decodeFrame(rfid('read', 250, 0), ctx))).toBe(crc16Epc(epcOf('tag-1')).toString(16).padStart(4, '0'))
    expect(idOf(withEpc)).not.toBe(idOf(decodeFrame(rfid('read', 250, 0), ctx)))
    // A broadcast command addresses no tag, so it carries no id to decode.
    expect(idOf(decodeFrame(rfid('query', 250, 1_000_000), ctx))).toBe('broadcast (inventory)')
  })

  it('every backscatter frame a real inventory puts on the air decodes to its own sizes', () => {
    const sc = bsScenario({ pollIntervalMs: 20, write: true, txopMs: 10 }, [bsTag('tag-1', 0.15), bsTag('tag-2', 0.25, 'y')])
    const sim = new Simulation(sc)
    const frames: FrameDesc[] = []
    for (let t = 20 * MS; t <= 200 * MS; t += 20 * MS) {
      for (const r of sim.runUntil(t).records) {
        if (r.type === 'TX_START' && (r.frame.kind === 'ampRfid' || r.frame.kind === 'ampBsReply')) frames.push(r.frame)
      }
    }
    const bsCtx: DecodeCtx = { apId: 'ap', isEdca: true }
    expect(frames.some((f) => f.kind === 'ampRfid')).toBe(true)
    expect(frames.some((f) => f.kind === 'ampBsReply')).toBe(true)
    // …and every Gen2 message the round can produce really passed through here
    const cmds = new Set(frames.flatMap((f) => (f.amp?.rfid ? [f.amp.rfid.cmd] : [])))
    const replies = new Set(frames.flatMap((f) => (f.amp?.bs ? [f.amp.bs.reply] : [])))
    expect([...cmds].sort()).toEqual(['ack', 'query', 'queryRep', 'read', 'write'])
    expect([...replies].sort()).toEqual(['epc', 'read', 'rn16', 'write'])
    for (const f of frames) {
      const d = decodeFrame(f, bsCtx)
      const label = `${f.kind} ${f.amp?.rfid?.cmd ?? f.amp?.bs?.reply}`
      expect(d.bytes, label).toBe(f.bytes)
      expect(d.ppdu.reduce((sum, x) => sum + x.durNs, 0), label).toBe(f.txTimeNs)
      expect(d.ppdu.every((x) => x.durNs > 0), label).toBe(true)
    }
    // Only the first PPDU of each TXOP carries a WUP-Excitation segment.
    const wups = frames.filter((f) => d1(f)).length
    expect(wups).toBeGreaterThan(0)
    expect(wups).toBeLessThan(frames.filter((f) => f.kind === 'ampRfid').length)
  })
})

/** Does this downlink PPDU carry a WUP-Excitation at all? */
function d1(f: FrameDesc): boolean {
  return (f.amp?.rfid?.wupNs ?? 0) > 0
}
