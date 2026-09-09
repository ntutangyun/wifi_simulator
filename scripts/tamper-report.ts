/**
 * EDCA tampered-driver report data: run a household with one phone cheating
 * in each of the seven ways (plus a compliant baseline) and collect
 * per-station outcomes. `npx vite-node scripts/tamper-report.ts --dump`
 */
import { HOUSEHOLDS } from '../src/model/households'
import { TAMPER_KINDS, TAMPER_PRESETS, type ProfileId, type Scenario, type TamperKind } from '../src/model/scenario'
import { Simulation } from '../src/engine/simulation'
import { applyRecord, initViewState, type ViewState } from '../src/model/view'

const MS = 1_000_000
export const RUN_MS = 8000
export const SEEDS = [11, 23, 37]
/** Which station cheats: `--cheater <id>` (default the Xiaomi gamer, sta-2). Recorded in the JSON. */
const argAfter = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined }
export const CHEATER = argAfter('--cheater') ?? 'sta-2'

export type Config = 'baseline' | TamperKind
export const CONFIGS: Config[] = ['baseline', ...TAMPER_KINDS]

export interface Experiment {
  id: string
  title: string
  /** Build the scenario before the cheat is applied. */
  build: () => Scenario
}

const household = (id: string): Scenario => HOUSEHOLDS.find((h) => h.id === id)!.scenario()
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** Two Wi-Fi 6 laptops saturating the uplink, cloned from the TV's node config. */
function withUploaders(sc: Scenario): Scenario {
  const tv = sc.nodes.find((n) => n.id === 'sta-4')!
  sc.nodes.push(
    { ...clone(tv), id: 'sta-5', name: 'Laptop A (upload)', pos: { x: 1, y: 7.2, z: 1 }, profiles: ['saturated'] },
    { ...clone(tv), id: 'sta-6', name: 'Laptop B (upload)', pos: { x: 9, y: 7.2, z: 1 }, profiles: ['saturated'] },
  )
  return sc
}

/** The cheater also runs a cloud backup: bulk uplink to hog with. */
function cheaterUploads(sc: Scenario): Scenario {
  const n = sc.nodes.find((x) => x.id === CHEATER)!
  n.profiles = [...n.profiles, 'backup']
  return sc
}

/** Mobile-gaming scenarios; the cheater (sta-1, a Huawei Mate 80 Pro) is a gamer in all of them. */
export const EXPERIMENTS: Experiment[] = [
  { id: 'light', title: '三人开黑（轻载）', build: () => household('three-gamers') },
  { id: 'bg-upload', title: '三人开黑 + 两台笔记本饱和上传', build: () => withUploaders(household('three-gamers')) },
  { id: 'full', title: '满屋子人（混合业务）', build: () => household('full-house') },
  { id: 'full-upload', title: '满屋子人 + 作弊者同时云备份', build: () => cheaterUploads(household('full-house')) },
]

export interface NodeResult {
  id: string
  name: string
  profiles: ProfileId[]
  txOk: number
  retries: number
  drops: number
  collisions: number
  airtimePct: number
  appRttMeanMs: number | null
  appRttMaxMs: number | null
  appRttN: number
  txLatMeanMs: number | null
  txLatMaxMs: number | null
  rxLatMeanMs: number | null
  rxLatMaxMs: number | null
  bytesDeliveredKB: number
  /** RTT samples by server kind (game / video / web / call). */
  pings: PingSamples
}
export interface RunResult {
  experiment: string
  config: Config
  nodes: NodeResult[]
  /** Sum of per-node collision involvements (a two-way collision counts twice). */
  bssCollisions: number
  /** COLLISION records, each event once. */
  collisionEvents: number
  bssDelivered: number
  busyPct: number
  cheater: CheaterTrace
}

export function scenarioFor(exp: Experiment, config: Config): Scenario {
  const sc = exp.build()
  const n = sc.nodes.find((x) => x.id === CHEATER)!
  if (config !== 'baseline') n.tamper = { ...TAMPER_PRESETS[config] }
  return sc
}

/** RTT samples of one station, split by the kind of server the reply came from. */
export type PingSamples = Record<string, number[]>

interface CheaterTrace {
  /** Data PPDUs the cheater started. */
  dataTx: number
  /** RX_OK of those at stations other than the AP (one frame can count several times: once per decoding station). */
  dataDecodedByStas: number
  /** NAV_SET records whose source is one of the cheater's data frames. */
  navSets: number
  /** NAV_SET records whose source is one of the cheater's RTS frames (sent at 24 Mb/s, decodable much further out). */
  navSetsRts: number
}

function finalView(sc: Scenario, ms: number): { vs: ViewState; trace: CheaterTrace; pings: Record<string, PingSamples>; collisionEvents: number } {
  const sim = new Simulation(sc)
  const vs = initViewState(sc)
  const trace: CheaterTrace = { dataTx: 0, dataDecodedByStas: 0, navSets: 0, navSetsRts: 0 }
  let collisionEvents = 0
  const kindOf = new Map(sc.servers.map((x) => [x.id, x.kind]))
  const pings: Record<string, PingSamples> = {}
  const seen: Record<string, { n: number; sum: number }> = {}
  for (const n of sc.nodes) { pings[n.id] = {}; seen[n.id] = { n: 0, sum: 0 } }
  for (let t = 100 * MS; t <= ms * MS; t += 100 * MS) {
    for (const r of sim.runUntil(t).records) {
      applyRecord(vs, r)
      if (r.type === 'TX_START' && r.node === CHEATER && r.frame.kind === 'data') trace.dataTx++
      else if (r.type === 'RX_OK' && r.from === CHEATER && r.node !== 'ap' && r.frame.kind === 'data') trace.dataDecodedByStas++
      else if (r.type === 'NAV_SET' && r.source === `data:${CHEATER}`) trace.navSets++
      else if (r.type === 'NAV_SET' && r.source === `rts:${CHEATER}`) trace.navSetsRts++
      else if (r.type === 'COLLISION') collisionEvents++
      // The view adds exactly one appRtt sample per delivered reply and names the
      // server it came from; pick the sample up here and file it by server kind.
      if (r.type === 'RX_OK' && r.node in seen) {
        const st = vs.nodes[r.node].stats
        const prev = seen[r.node]
        if (st.appRtt.n === prev.n + 1) {
          const kind = kindOf.get(st.appRttServer ?? '') ?? 'unknown'
          ;(pings[r.node][kind] ??= []).push((st.appRtt.sumNs - prev.sum) / MS)
        }
        prev.n = st.appRtt.n
        prev.sum = st.appRtt.sumNs
      }
    }
  }
  return { vs, trace, pings, collisionEvents }
}

export function runConfig(exp: Experiment, config: Config, ms = RUN_MS): RunResult {
  return runScenario(exp, config, scenarioFor(exp, config), ms)
}

function runScenario(exp: Experiment, config: Config, sc: Scenario, ms: number): RunResult {
  const { vs, trace, pings, collisionEvents } = finalView(sc, ms)
  const mean = (l: { n: number; sumNs: number }) => (l.n ? l.sumNs / l.n / MS : null)
  const max = (l: { n: number; maxNs: number }) => (l.n ? l.maxNs / MS : null)
  const nodes: NodeResult[] = sc.nodes.map((n) => {
    const v = vs.nodes[n.id]
    const sib = vs.nodes[`${n.id}#6g`]
    const s = v.stats
    const air = s.airtimeNs + (sib?.stats.airtimeNs ?? 0)
    return {
      id: n.id, name: n.name, profiles: n.profiles,
      txOk: s.txOk + (sib?.stats.txOk ?? 0), retries: s.retries + (sib?.stats.retries ?? 0), drops: s.drops + (sib?.stats.drops ?? 0),
      collisions: s.collisions + (sib?.stats.collisions ?? 0),
      airtimePct: (air / (ms * MS)) * 100,
      appRttMeanMs: mean(s.appRtt), appRttMaxMs: max(s.appRtt), appRttN: s.appRtt.n,
      txLatMeanMs: mean(s.txLatency), txLatMaxMs: max(s.txLatency),
      rxLatMeanMs: mean(s.rxLatency), rxLatMaxMs: max(s.rxLatency),
      bytesDeliveredKB: (s.bytesDelivered + (sib?.stats.bytesDelivered ?? 0)) / 1024,
      pings: pings[n.id],
    }
  })
  return {
    experiment: exp.id, config, nodes,
    bssCollisions: nodes.reduce((a, n) => a + n.collisions, 0),
    collisionEvents,
    bssDelivered: nodes.reduce((a, n) => a + n.txOk, 0),
    busyPct: nodes.reduce((a, n) => a + n.airtimePct, 0),
    cheater: trace,
  }
}

/** One configuration over several seeds, pooled: latency sums pooled by count, counts averaged, maxima kept. */
export interface Dist {
  n: number
  meanMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}
export function dist(xs: number[]): Dist | null {
  if (!xs.length) return null
  const a = [...xs].sort((p, q) => p - q)
  const q = (f: number) => a[Math.min(a.length - 1, Math.max(0, Math.ceil(f * a.length) - 1))]
  return { n: a.length, meanMs: a.reduce((s, x) => s + x, 0) / a.length, p50Ms: q(0.5), p95Ms: q(0.95), maxMs: a[a.length - 1] }
}

export interface PooledNode {
  id: string
  name: string
  profiles: ProfileId[]
  txOk: number
  retries: number
  drops: number
  collisions: number
  airtimePct: number
  appRttMeanMs: number | null
  appRttMaxMs: number | null
  appRttN: number
  txLatMeanMs: number | null
  bytesDeliveredKB: number
  /** Game-server pings pooled over the seeds (what a game's ping counter shows). */
  game: Dist | null
  /** The same, one entry per seed, so a claim can be checked for seed-to-seed consistency. */
  gameBySeed: (Dist | null)[]
  /** Pings to every other server kind pooled (video / web / call). */
  otherApps: Dist | null
}
export interface PooledResult {
  experiment: string
  config: Config
  cheaterId: string
  seeds: number[]
  runMs: number
  nodes: PooledNode[]
  /** Per-seed average of the per-node involvement sum (a two-way collision counts twice). */
  bssCollisions: number
  /** Per-seed average of collision events, each counted once. */
  collisionEvents: number
  busyPct: number
  /** Per-seed averages of the cheater's frame trace. */
  cheater: CheaterTrace
}

export function runPooled(exp: Experiment, config: Config, seeds = SEEDS, ms = RUN_MS): PooledResult {
  const runs = seeds.map((seed) => {
    const sc = scenarioFor(exp, config)
    sc.seed = seed
    return runScenario(exp, config, sc, ms)
  })
  const k = runs.length
  const nodes: PooledNode[] = runs[0].nodes.map((_, i) => {
    const rs = runs.map((r) => r.nodes[i])
    const n = rs.reduce((a, x) => a + x.appRttN, 0)
    const sum = rs.reduce((a, x) => a + (x.appRttMeanMs ?? 0) * x.appRttN, 0)
    const txN = rs.reduce((a, x) => a + x.txOk, 0)
    const txSum = rs.reduce((a, x) => a + (x.txLatMeanMs ?? 0) * x.txOk, 0)
    return {
      id: rs[0].id, name: rs[0].name, profiles: rs[0].profiles,
      txOk: rs.reduce((a, x) => a + x.txOk, 0) / k,
      retries: rs.reduce((a, x) => a + x.retries, 0) / k,
      drops: rs.reduce((a, x) => a + x.drops, 0) / k,
      collisions: rs.reduce((a, x) => a + x.collisions, 0) / k,
      airtimePct: rs.reduce((a, x) => a + x.airtimePct, 0) / k,
      appRttMeanMs: n ? sum / n : null,
      appRttMaxMs: rs.some((x) => x.appRttMaxMs !== null) ? Math.max(...rs.map((x) => x.appRttMaxMs ?? 0)) : null,
      appRttN: n,
      txLatMeanMs: txN ? txSum / txN : null,
      bytesDeliveredKB: rs.reduce((a, x) => a + x.bytesDeliveredKB, 0) / k,
      game: dist(rs.flatMap((x) => x.pings.game ?? [])),
      gameBySeed: rs.map((x) => dist(x.pings.game ?? [])),
      otherApps: dist(rs.flatMap((x) => Object.entries(x.pings).filter(([kind]) => kind !== 'game').flatMap(([, v]) => v))),
    }
  })
  return {
    experiment: exp.id, config, cheaterId: CHEATER, seeds, runMs: ms, nodes,
    bssCollisions: runs.reduce((a, r) => a + r.bssCollisions, 0) / k,
    collisionEvents: runs.reduce((a, r) => a + r.collisionEvents, 0) / k,
    busyPct: runs.reduce((a, r) => a + r.busyPct, 0) / k,
    cheater: {
      dataTx: runs.reduce((a, r) => a + r.cheater.dataTx, 0) / k,
      dataDecodedByStas: runs.reduce((a, r) => a + r.cheater.dataDecodedByStas, 0) / k,
      navSets: runs.reduce((a, r) => a + r.cheater.navSets, 0) / k,
      navSetsRts: runs.reduce((a, r) => a + r.cheater.navSetsRts, 0) / k,
    },
  }
}

export function runAll(log?: (s: string) => void): PooledResult[] {
  const out: PooledResult[] = []
  const t0 = Date.now()
  for (const exp of EXPERIMENTS) for (const c of CONFIGS) {
    out.push(runPooled(exp, c))
    log?.(`${exp.id}/${c} done at ${Date.now() - t0} ms`)
  }
  return out
}

if (process.argv.includes('--dump')) {
  console.log(JSON.stringify(runAll((s) => console.error(s)), null, 1))
}
