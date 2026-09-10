/**
 * Render the EDCA tampered-driver report (Chinese, self-contained HTML).
 *   npx vite-node scripts/tamper-report-html.ts <pooled.json> <out.html>
 * The JSON is what `scripts/tamper-report.ts --dump` prints.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { EDCA_PARAMS } from '../src/engine/phy'
import { TAMPER_PRESETS, type TamperKind } from '../src/model/scenario'
import { CONFIGS, EXPERIMENTS, RUN_MS, SEEDS, type Config, type Dist, type PooledNode, type PooledResult } from './tamper-report'

const [, , inPath = 'tamper-pooled.json', outPath = 'docs/reports/edca-tamper-report.zh.html'] = process.argv
const results: PooledResult[] = JSON.parse(readFileSync(inPath, 'utf-8'))
/** The cheating station is whatever the collector was run with; every run carries it. */
const CHEATER = results[0].cheaterId

// ---------------------------------------------------------------------------
// static content: what each cheat is, how to catch it, who can catch it
// ---------------------------------------------------------------------------

interface CheatDoc {
  name: string
  params: string
  how: string
  detect: string
  apAlone: '足够' | '需协助' | '足够（统计）'
  why: string
}

const AC = EDCA_PARAMS
const aifsUs = (aifsn: number) => 16 + aifsn * 9
const CHEATS: Record<TamperKind, CheatDoc> = {
  escalate: {
    name: '优先级抬升',
    params: `所有帧标为 AC_VO（AIFSN ${AC[3].aifsn}，CW ${AC[3].cwMin}–${AC[3].cwMax}）`,
    how: '驱动把每个上行 MSDU 都放进语音队列：等待最短的 AIFS、抽最小的退避，而流量本身是游戏、备份或网页。',
    detect: 'AP 转发上行帧时能同时看到帧头的 TID/UP 和 IP 头的 DSCP、协议与端口：标成 VO 的帧承载着 DSCP 为尽力而为的游戏或备份流量，与 AP 下发的 QoS Map 不符，这是逐帧可判的硬证据。流量形态是补充线索：VO 队列里出现 1500 B 大包、长 A-MPDU 或持续 Mb/s 级速率；但本报告里作弊者的游戏上行包只有 89–131 B、平均每 30 ms 一个（实测王者荣耀），比语音还小还稀，单靠包长/速率抓不到它。',
    apAlone: '足够',
    why: 'AP 是每个上行帧的接收方和转发者，TID 与 DSCP/端口都在它手里，不需要旁证。',
  },
  aifs: {
    name: 'AIFS 地板',
    params: `所有类别 AIFSN = 1（AIFS ${aifsUs(1)} µs，正常 VO ${aifsUs(AC[3].aifsn)} / BE ${aifsUs(AC[1].aifsn)} / BK ${aifsUs(AC[0].aifsn)} µs）`,
    how: '介质空闲后只等 SIFS + 1 个时隙就开始倒数或发送，比任何合规终端都早一到六个时隙进入竞争。',
    detect: '测量该终端每次发送前的"空闲间隔"：从 AP 看到的介质空闲起点到该终端前导到达。作弊者仍会抽退避，所以间隔并非常数，但其下限是 25 µs（SIFS + 1 时隙），而合规终端的下限是 AIFS[AC]（VO 34、BE 43 µs）：看分布的最小值与其在所有类别上的一致性。',
    apAlone: '足够（统计）',
    why: 'AP 能观测每次发送前的等待，但 AP 与作弊者对"介质何时空闲"的判断可能不同（隐藏节点、OBSS、捕获效应），单次样本不能定罪，需要几十次样本看分布下限。合规终端的旁证（它们看到的间隔、自己退避被压制的次数）能排除视角歧义，但不是必需。与 CW 坍缩的观测量相同，因此判定也相同。',
  },
  cw: {
    name: 'CW 坍缩',
    params: 'CWmin = CWmax = 0：从不随机退避',
    how: 'AIFS 一到就发，永远不抽退避。合规终端在 [0, CW] 上均匀抽取，平均要多等 CW/2 个时隙。',
    detect: '发送时刻分布：AIFS 之后的额外等待应在 [0, CW] 个时隙上均匀分布；作弊者的额外等待恒为 0。单次"抽到 0"是合法的（退避也可能已在他人忙期里倒数完），必须看分布。',
    apAlone: '足够（统计）',
    why: 'AP 能观测每次发送前的等待，累积足够样本后分布的差异很明显（合规终端的额外等待均匀分布，作弊者恒为 0）；视角歧义与 AIFS 地板相同，用统计克服，合规终端报告的碰撞/重传率上升是有力但非必需的旁证。重传帧（Retry=1）前的等待更有说服力，见"不加倍"。',
  },
  noDouble: {
    name: '不加倍',
    params: 'CWmax 钉在 CWmin：碰撞或丢 ACK 后窗口不增长',
    how: '§10.3.3（DCF）与 §10.23.2.2（EDCA）要求每次失败后 CW 取下一个 2ⁿ−1；作弊者始终用 CWmin 重发，在拥塞时反复抢占。',
    detect: 'Retry=1 的重传帧前的空闲等待没有随重传次数增长；第 n 次重传的等待分布与首发完全相同。',
    apAlone: '需协助',
    why: 'Retry 位对 AP 可见，可以比较重传帧与首发帧的等待分布，但低负载时几乎没有重传样本。碰撞事件本身 AP 看不见（两帧都损坏、无法归属），合规终端的重传计数上升是把碰撞归因到作弊者的关键旁证。为什么必须靠合规终端，见本节末尾的展开说明。',
  },
  txopHog: {
    name: 'TXOP 霸占',
    params: `每次 TXOP 8 ms（正常 VI ${AC[2].txopLimitNs / 1e6} / BE ${AC[1].txopLimitNs / 1e6} / VO ${AC[3].txopLimitNs / 1e6} ms）`,
    how: '赢得一次信道后以 SIFS 相连连续发送 8 ms，其间没有人能插入——SIFS 比任何 AIFS 都短。',
    detect: 'AP 作为接收方直接测得该终端单次 TXOP（SIFS 相连的帧序列）总时长超过其 AC 的 TXOP 限值。',
    apAlone: '足够',
    why: 'TXOP 内的每一帧都发给 AP，AP 知道帧的 AC 与时长，累加即可；不存在视角歧义。',
  },
  navInflate: {
    name: 'NAV 膨胀',
    params: '每个帧的 Duration 字段 +3 ms',
    how: '让所有听到该帧的终端把 NAV 设得比交换实际需要的长 3 ms，在作弊者沉默时仍不敢竞争。',
    detect: 'Duration 字段 vs 实际所需：单次保护下应为 SIFS + ACK/BA，多重保护下最多到该 AC 的 TXOP 剩余时间——+3 ms 超过了 BE 的 2.528 ms 限值，AP 能直接判定；小于 TXOP 剩余量的膨胀则与合法的多重保护无法区分。合规终端也能发现：NAV 期间介质长时间空闲。',
    apAlone: '足够',
    why: 'AP 一定能解码作弊者发给它的帧，Duration 语义是确定的。作弊效果取决于谁能解码作弊者的帧：解不出帧就读不到 Duration（各场景的解码计数见第 1 节），而 AP 是唯一确定能解码的接收方。',
  },
  greedy: {
    name: '贪婪（全套）',
    params: '全标 AC_VO + AIFSN 1 + CW 0/0 + TXOP 8 ms',
    how: '以上全部叠加：最短等待、不退避、抢到就霸占 8 ms。专利草稿中的违规者。',
    detect: '以上任一特征；最直接的是 TXOP 超限与 VO 队列里的大流量，两者都是 AP 单独可测的硬证据。',
    apAlone: '足够',
    why: 'TXOP 时长和 TID 是 AP 直接观测到的确定量，不依赖介质视角，也不需要统计推断。',
  },
}

const CONFIG_LABEL: Record<Config, string> = {
  baseline: '合规基线', escalate: '优先级抬升', aifs: 'AIFS 地板', cw: 'CW 坍缩',
  noDouble: '不加倍', txopHog: 'TXOP 霸占', navInflate: 'NAV 膨胀', greedy: '贪婪',
}

// ---------------------------------------------------------------------------
// derived numbers
// ---------------------------------------------------------------------------

const isGamer = (n: PooledNode) => n.profiles.includes('gaming')
const byExp = (id: string) => results.filter((r) => r.experiment === id)
const get = (exp: string, cfg: Config) => results.find((r) => r.experiment === exp && r.config === cfg)!

interface Summary {
  cheater: number | null
  cheaterP95: number | null
  cheaterMax: number | null
  gamers: number | null
  gamersP95: number | null
  gamersMax: number | null
  others: number | null
  collisions: number
  busy: number
}
/** Pool several stations' distributions: means by sample count, tails by the worst station. */
function poolDist(ds: (Dist | null)[]): { mean: number | null; p95: number | null; max: number | null } {
  const xs = ds.filter((d): d is Dist => d !== null)
  const n = xs.reduce((a, d) => a + d.n, 0)
  if (!n) return { mean: null, p95: null, max: null }
  return {
    mean: xs.reduce((a, d) => a + d.meanMs * d.n, 0) / n,
    p95: Math.max(...xs.map((d) => d.p95Ms)),
    max: Math.max(...xs.map((d) => d.maxMs)),
  }
}
function summarize(r: PooledResult): Summary {
  const cheater = r.nodes.find((n) => n.id === CHEATER)!
  const gamers = r.nodes.filter((n) => isGamer(n) && n.id !== CHEATER)
  const others = r.nodes.filter((n) => n.id !== 'ap' && n.id !== CHEATER && n.otherApps !== null)
  const g = poolDist(gamers.map((n) => n.game))
  const o = poolDist(others.map((n) => n.otherApps))
  return {
    cheater: cheater.game?.meanMs ?? null, cheaterP95: cheater.game?.p95Ms ?? null, cheaterMax: cheater.game?.maxMs ?? null,
    gamers: g.mean, gamersP95: g.p95, gamersMax: g.max,
    others: o.mean,
    collisions: r.collisionEvents / (r.runMs / 1000), busy: r.busyPct,
  }
}

/**
 * How many seeds agree with the pooled direction of a change in the compliant
 * gamers' (or the cheater's) mean ping. A pooled delta that only one seed
 * produces is an outlier, not a finding.
 */
function seedAgreement(exp: string, cfg: Config, who: 'cheater' | 'gamers'): { agree: number; total: number; perSeed: string } {
  const b = get(exp, 'baseline'), c = get(exp, cfg)
  const pick = (r: PooledResult) => who === 'cheater'
    ? [r.nodes.find((n) => n.id === CHEATER)!]
    : r.nodes.filter((n) => isGamer(n) && n.id !== CHEATER)
  const seeds = b.seeds.length
  const meanAt = (r: PooledResult, i: number) => {
    const ds = pick(r).map((n) => n.gameBySeed[i]).filter((d): d is Dist => d !== null)
    const n = ds.reduce((a, d) => a + d.n, 0)
    return n ? ds.reduce((a, d) => a + d.meanMs * d.n, 0) / n : null
  }
  const pooledDelta = (summarize(c)[who] ?? 0) - (summarize(b)[who] ?? 0)
  let agree = 0
  const per: string[] = []
  for (let i = 0; i < seeds; i++) {
    const d = (meanAt(c, i) ?? 0) - (meanAt(b, i) ?? 0)
    if (Math.sign(d) === Math.sign(pooledDelta) || Math.abs(d) < 0.5) agree++
    per.push(`${(meanAt(b, i) ?? 0).toFixed(1)}→${(meanAt(c, i) ?? 0).toFixed(1)}`)
  }
  return { agree, total: seeds, perSeed: per.join('、') }
}

const fmt = (x: number | null, d = 1) => (x === null ? '—' : x.toFixed(d))
const delta = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a)
const pct = (a: number | null, b: number | null) => (a === null || b === null || a === 0 ? null : ((b - a) / a) * 100)
/** ±x.x ms (±y%) with a colour class: gain for the reader is not the same as gain for the cheater. */
function deltaCell(base: number | null, val: number | null): string {
  const d = delta(base, val), p = pct(base, val)
  if (d === null || p === null) return '<span class="muted">—</span>'
  const cls = Math.abs(p) < 5 ? 'flat' : d < 0 ? 'down' : 'up'
  if (Math.abs(d) < 0.05) return `<span class="d flat">0.0 ms（0%）</span>`
  const sign = d > 0 ? '+' : ''
  return `<span class="d ${cls}">${sign}${d.toFixed(1)} ms（${sign}${p.toFixed(0)}%）</span>`
}

// ---------------------------------------------------------------------------
// charts: horizontal grouped bars, cheater vs compliant gamers, per scenario
// ---------------------------------------------------------------------------

const SERIES = { cheater: '#2a78d6', gamers: '#eb6834' } // validated categorical slots 1, 2 (light)
const cheaterName = get('light', 'baseline').nodes.find((n) => n.id === CHEATER)!.name
const cheaterNameFull = get('full', 'baseline').nodes.find((n) => n.id === CHEATER)!.name
/** "Xiaomi 17 Pro Max" → "Xiaomi": the model differs per household, the brand does not. */
const cheaterShort = cheaterName.split(' ')[0]

function rttChart(expId: string): string {
  const rows = CONFIGS.map((c) => ({ c, s: summarize(get(expId, c)) }))
  const maxV = Math.max(...rows.flatMap((r) => [r.s.cheater ?? 0, r.s.gamers ?? 0]))
  const niceMax = Math.ceil(maxV / 20) * 20 || 20
  const W = 760, LABEL_W = 96, PAD_R = 56, groupH = 34, barH = 12, gap = 2, top = 28
  const plotW = W - LABEL_W - PAD_R
  const H = top + rows.length * groupH + 34
  const x = (v: number) => LABEL_W + (v / niceMax) * plotW
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax) // niceMax is a multiple of 20, so every tick is an integer
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${EXPERIMENTS.find((e) => e.id === expId)!.title}：各作弊方式下的 ping">`
  // legend
  svg += `<g font-size="11" fill="#444">
    <rect x="${LABEL_W}" y="6" width="10" height="10" rx="2" fill="${SERIES.cheater}"/><text x="${LABEL_W + 14}" y="15">作弊者（${cheaterShort}）</text>
    <rect x="${LABEL_W + 150}" y="6" width="10" height="10" rx="2" fill="${SERIES.gamers}"/><text x="${LABEL_W + 164}" y="15">合规玩家均值</text>
    <text x="${W - PAD_R}" y="15" text-anchor="end" fill="#777">平均 ping，ms</text></g>`
  // grid
  for (const t of ticks) {
    svg += `<line x1="${x(t)}" y1="${top}" x2="${x(t)}" y2="${H - 30}" stroke="#e6e6e3" stroke-width="1"/>`
    svg += `<text x="${x(t)}" y="${H - 14}" font-size="10" fill="#777" text-anchor="middle">${t}</text>`
  }
  rows.forEach((r, i) => {
    const y0 = top + i * groupH
    const isBase = r.c === 'baseline'
    svg += `<text x="${LABEL_W - 8}" y="${y0 + groupH / 2 + 4}" font-size="11.5" fill="#222" text-anchor="end" font-weight="${isBase ? 600 : 400}">${CONFIG_LABEL[r.c]}</text>`
    const bar = (v: number | null, color: string, dy: number, label: string) => {
      if (v === null) return ''
      const w = Math.max(1, x(v) - LABEL_W)
      const s = `<rect x="${LABEL_W}" y="${y0 + dy}" width="${w}" height="${barH}" fill="${color}" rx="0"><title>${label}: ${v.toFixed(1)} ms</title></rect>`
      // 4 px rounded data end anchored to the baseline
      return s + `<rect x="${LABEL_W + w - 4}" y="${y0 + dy}" width="4" height="${barH}" fill="${color}" rx="3"/>`
    }
    svg += bar(r.s.cheater, SERIES.cheater, 4, CONFIG_LABEL[r.c] + ' · 作弊者')
    svg += bar(r.s.gamers, SERIES.gamers, 4 + barH + gap, CONFIG_LABEL[r.c] + ' · 合规玩家')
    // selective direct label: the cheater's value only
    if (r.s.cheater !== null) svg += `<text x="${x(r.s.cheater) + 6}" y="${y0 + 4 + barH - 2}" font-size="10.5" fill="#333">${r.s.cheater.toFixed(1)}</text>`
  })
  svg += `<line x1="${LABEL_W}" y1="${top}" x2="${LABEL_W}" y2="${H - 30}" stroke="#bbb" stroke-width="1"/></svg>`
  return svg
}

// ---------------------------------------------------------------------------
// tables
// ---------------------------------------------------------------------------

function scenarioSetupTable(): string {
  const rows = EXPERIMENTS.map((e) => {
    const base = get(e.id, 'baseline')
    const s = summarize(base)
    const stas = base.nodes.filter((n) => n.id !== 'ap')
    const desc = stas.map((n) => `${n.name}${n.id === CHEATER ? '（作弊者）' : ''}：${n.profiles.map(profileZh).join('+')}`).join('；')
    return `<tr><td><b>${e.title}</b></td><td>${desc}</td><td class="num">${s.busy.toFixed(0)}%</td><td class="num">${s.collisions.toFixed(0)}</td><td class="num">${fmt(s.cheater)} / ${fmt(s.gamers)}</td></tr>`
  })
  return `<table><thead><tr><th>场景</th><th>终端与业务</th><th>空口占用</th><th>碰撞事件 / 秒</th><th>基线游戏 ping：作弊者 / 合规玩家（ms）</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}

function profileZh(p: string): string {
  return ({ gaming: '手游', video: '视频', voice: '通话', browsing: '网页', backup: '云备份', iot: '传感器', saturated: '饱和上传', idle: '空闲', p2pvideo: '互传视频' } as Record<string, string>)[p] ?? p
}

function impactCell(cheat: TamperKind): string {
  const rows = EXPERIMENTS.map((e) => {
    const b = summarize(get(e.id, 'baseline'))
    const c = summarize(get(e.id, cheat))
    const p95 = (a: number | null, b: number | null) => `<div class="small muted">P95 ${fmt(a, 0)} → ${fmt(b, 0)}</div>`
    const agree = (who: 'cheater' | 'gamers') => {
      const a = seedAgreement(e.id, cheat, who)
      const weak = a.agree < a.total && Math.abs(delta(who === 'cheater' ? b.cheater : b.gamers, who === 'cheater' ? c.cheater : c.gamers) ?? 0) >= 1
      return `<div class="small ${weak ? 'weak' : 'muted'}" title="各种子：${a.perSeed}">${a.agree}/${a.total} 种子同向</div>`
    }
    return `<tr><td class="scen">${e.title}</td>
      <td class="num">${fmt(b.cheater)} → <b>${fmt(c.cheater)}</b><br>${deltaCell(b.cheater, c.cheater)}${p95(b.cheaterP95, c.cheaterP95)}${agree('cheater')}</td>
      <td class="num">${fmt(b.gamers)} → <b>${fmt(c.gamers)}</b><br>${deltaCell(b.gamers, c.gamers)}${p95(b.gamersP95, c.gamersP95)}${agree('gamers')}</td>
      <td class="num">${fmt(b.others)} → <b>${fmt(c.others)}</b><br>${deltaCell(b.others, c.others)}</td></tr>`
  })
  return `<table class="inner"><thead><tr><th>场景</th><th>作弊者游戏 ping</th><th>合规玩家游戏 ping</th><th>其他合规终端应用 RTT</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
}

function mainTable(): string {
  const rows = (Object.keys(CHEATS) as TamperKind[]).map((k) => {
    const d = CHEATS[k]
    const preset = JSON.stringify(TAMPER_PRESETS[k])
    return `<tr>
      <td><b>${d.name}</b><div class="muted mono">${preset}</div><div class="small">${d.params}</div><p>${d.how}</p></td>
      <td>${d.detect}</td>
      <td><span class="tag ${d.apAlone === '需协助' ? 'warn' : 'ok'}">${d.apAlone}</span><p>${d.why}</p></td>
      <td class="impact">${impactCell(k)}</td>
    </tr>`
  })
  return `<table class="main"><thead><tr>
    <th style="width:19%">作弊方式与原理</th><th style="width:19%">如何检测</th><th style="width:19%">AP 单独是否足够</th><th>仿真影响（基线 → 作弊，平均 RTT，ms）</th>
  </tr></thead><tbody>${rows.join('')}</tbody></table>`
}

function detailTable(expId: string): string {
  const rs = byExp(expId)
  const nodes = rs[0].nodes.filter((n) => n.id !== 'ap')
  const head = `<tr><th>配置</th>${nodes.map((n) => `<th>${n.name}${n.id === CHEATER ? ' ⚠' : ''}<div class="small muted">${n.profiles.map(profileZh).join('+')}</div></th>`).join('')}<th>碰撞事件 / 秒</th><th>空口占用</th></tr>`
  const body = rs.map((r) => {
    const cells = r.nodes.filter((n) => n.id !== 'ap').map((n) => {
      const d = n.game ?? n.otherApps
      const rtt = d === null ? '—' : `${d.meanMs.toFixed(1)} <span class="muted">/ ${d.p95Ms.toFixed(0)} / ${d.maxMs.toFixed(0)}</span>`
      return `<td class="num">${rtt}<div class="small muted">重传 ${n.retries.toFixed(0)} · 空口 ${n.airtimePct.toFixed(1)}%</div></td>`
    })
    return `<tr><td>${CONFIG_LABEL[r.config]}</td>${cells.join('')}<td class="num">${(r.collisionEvents / (r.runMs / 1000)).toFixed(0)}</td><td class="num">${r.busyPct.toFixed(0)}%</td></tr>`
  })
  return `<table class="detail"><thead>${head}</thead><tbody>${body.join('')}</tbody></table>
  <p class="small muted">每格：平均 / P95 / 最大 RTT（ms）——手游终端为游戏 ping，其他终端为其自身应用的往返；下行为该终端的重传次数与空口占比（${SEEDS.length} 个种子平均，RTT 样本为三个种子合并）。</p>`
}

// ---------------------------------------------------------------------------
// findings, computed from the numbers so the text cannot drift from them
// ---------------------------------------------------------------------------

function findings(): string {
  const out: string[] = []
  const cheats = CONFIGS.filter((c): c is TamperKind => c !== 'baseline')
  const S = (e: string, c: Config) => summarize(get(e, c))
  const abs = Math.abs
  const ms = (x: number | null) => `${fmt(x)} ms`

  // 1. light home: nothing to win
  const lb = S('light', 'baseline')
  const lightSpread = Math.max(...cheats.map((c) => abs((S('light', c).cheater ?? 0) - (lb.cheater ?? 0))))
  out.push(`<li><b>轻载家庭里作弊没有任何收益。</b>三人开黑场景空口只用了 ${lb.busy.toFixed(0)}%，七种作弊下作弊者的平均 ping 与基线 ${ms(lb.cheater)} 的最大偏差只有 ${lightSpread.toFixed(1)} ms：没有竞争可赢，WAN 的 25 ms 决定一切。</li>`)

  // 2. heavy contention: the biggest gain, and what it did to the compliant gamers
  const bb = S('bg-upload', 'baseline')
  const ranked = cheats.map((c) => ({ c, s: S('bg-upload', c) })).sort((a, b) => (a.s.cheater ?? 1e9) - (b.s.cheater ?? 1e9))
  const best = ranked[0]
  const gamersDir = (best.s.gamers ?? 0) < (bb.gamers ?? 0) ? '的 ping 也随之下降' : '的 ping 随之上升'
  const agC = seedAgreement('bg-upload', best.c, 'cheater'), agG = seedAgreement('bg-upload', best.c, 'gamers')
  out.push(`<li><b>重负载下，抢竞争的作弊立竿见影。</b>两台笔记本饱和上传把空口占满（${bb.busy.toFixed(0)}%，每秒 ${bb.collisions.toFixed(0)} 次碰撞事件），基线 ping 涨到 ${ms(bb.cheater)}。作弊者收益最大的是"${CONFIG_LABEL[best.c]}"：${ms(bb.cheater)} → ${ms(best.s.cheater)}（${pct(bb.cheater, best.s.cheater)!.toFixed(0)}%；${agC.agree}/${agC.total} 个种子同向，各种子 ${agC.perSeed}），合规玩家${gamersDir}（${ms(bb.gamers)} → ${ms(best.s.gamers)}；${agG.agree}/${agG.total} 个种子同向）。${(best.s.gamers ?? 0) < (bb.gamers ?? 0) ? `合规玩家为何也受益${agG.agree < agG.total ? '（且并非每个种子都如此）' : ''}，本报告的计数器没有分离出机制——他们自己的碰撞与重传次数几乎不变（见第 5 节），只能说重负载下一个抢先的终端并没有把玩家挤得更惨。` : ''}其次是 ${ranked.slice(1, 3).map((r) => `${CONFIG_LABEL[r.c]}（${ms(r.s.cheater)}）`).join('、')}。</li>`)

  // 3. the worst cost to compliant gamers across every scenario × cheat
  const costs = EXPERIMENTS.flatMap((e) => cheats.map((c) => ({ e, c, b: S(e.id, 'baseline'), s: S(e.id, c), ag: seedAgreement(e.id, c, 'gamers') })))
    .filter((x) => x.b.gamers !== null && x.s.gamers !== null)
    .sort((a, b) => (b.s.gamers! - b.b.gamers!) - (a.s.gamers! - a.b.gamers!))
  // the largest pooled increase that every seed reproduces; a one-seed outlier is reported as such
  const worst = costs.find((x) => x.ag.agree === x.ag.total) ?? costs[0]
  const outlier = costs[0] !== worst ? costs[0] : null
  const HARM: Record<TamperKind, string> = {
    escalate: '把所有帧标成语音后，作弊者在每一次竞争里都先于 AC_BE 的玩家进入倒数，输的是那些按规矩等 AIFS 的人。',
    aifs: '作弊者比所有人早一到六个时隙进入竞争，合规玩家的退避在它面前总是慢半拍。',
    cw: '作弊者从不退避，合规玩家每次都要多等自己抽到的那几个时隙。',
    noDouble: '碰撞后作弊者立刻用最小窗口重发，而合规玩家按规矩把窗口翻倍，重传越多差距越大。',
    txopHog: '作弊者每次赢得信道就连发 8 ms，其间合规玩家的游戏包只能排队。',
    navInflate: '能解码作弊者帧的终端每次都把 NAV 多设 3 ms，在作弊者早已沉默时仍不敢竞争。',
    greedy: '最短等待、不退避、抢到就霸占——合规玩家在每一个环节都排在后面。',
  }
  const worstPct = pct(worst.b.gamers, worst.s.gamers)!
  out.push(`<li><b>合规玩家付出的最大代价来自"${CONFIG_LABEL[worst.c]}"（${worst.e.title}）。</b>他们的平均游戏 ping 从 ${ms(worst.b.gamers)} 升到 ${ms(worst.s.gamers)}（${worstPct >= 0 ? '+' : ''}${worstPct.toFixed(0)}%），P95 ${fmt(worst.b.gamersP95, 0)} → ${fmt(worst.s.gamersP95, 0)} ms；同一配置下作弊者自己 ${ms(worst.b.cheater)} → ${ms(worst.s.cheater)}。${HARM[worst.c]}（${worst.ag.agree}/${worst.ag.total} 个种子同向：${worst.ag.perSeed}）${worstPct < 5 ? '这一代价在本组场景里并不大：作弊者的收益主要来自把自己的等待压到最短，而不是把别人挤出去。' : ''}${outlier ? `按合并均值看，"${CONFIG_LABEL[outlier.c]}"（${outlier.e.title}）的 ${ms(outlier.b.gamers)} → ${ms(outlier.s.gamers)} 更大，但只有 ${outlier.ag.agree}/${outlier.ag.total} 个种子同向（${outlier.ag.perSeed}），是单个种子的离群值，不作为结论。` : ''}</li>`)

  // 4. TXOP hog & NAV inflation need something to burst with
  const gamingOnly = ['light', 'bg-upload', 'full']
  const hogDev = Math.max(...gamingOnly.map((e) => abs((S(e, 'txopHog').cheater ?? 0) - (S(e, 'baseline').cheater ?? 0))))
  const bgB = S('bg-upload', 'baseline'), bgNav = S('bg-upload', 'navInflate')
  const navRun = get('bg-upload', 'navInflate').cheater
  const navWorks = navRun.navSets > 0.5 * navRun.dataTx
  const fuB = S('full-upload', 'baseline'), fuHog = S('full-upload', 'txopHog'), fuNav = S('full-upload', 'navInflate')
  const fuNavRun = get('full-upload', 'navInflate').cheater
  const hogText = `游戏上行包 89–131 B、平均每 30 ms 一个（实测王者荣耀），没有可以霸占的突发：在只打游戏的三个场景里，TXOP 霸占下作弊者的平均 ping 与基线的偏差不超过 ${hogDev.toFixed(1)} ms${hogDev < 0.05 ? '（轨迹完全相同）' : ''}。`
  const navText = navWorks
    ? `NAV 膨胀则不同：重负载场景 8 s 里作弊者发出 ${navRun.dataTx.toFixed(0)} 个数据帧，其他终端合计解码 ${navRun.dataDecodedByStas.toFixed(0)} 次（一帧可被多台终端解码）、设置了 ${navRun.navSets.toFixed(0)} 次比实际需要长 3 ms 的 NAV——能解码它的邻居每收到它一帧就被压住 3 ms（平均每 30 ms 一帧）。结果作弊者 ${ms(bgB.cheater)} → ${ms(bgNav.cheater)}，合规玩家 ${ms(bgB.gamers)} → ${ms(bgNav.gamers)}：被压住的主要是两台饱和上传的笔记本，所有玩家都因此受益。这一效果取决于谁能解码作弊者的帧：本引擎按每个 MCS 的 SINR 门限判定解码，与帧长无关，作弊者到 AP 的距离决定它用的 MCS，邻居能否解码常常只差零点几 dB——位置一变就可能一帧都解不出来。`
    : `NAV 膨胀也没有作用，原因是物理的：重负载场景 8 s 里作弊者发出 ${navRun.dataTx.toFixed(0)} 个数据帧，其他终端合计只解码了 ${navRun.dataDecodedByStas.toFixed(0)} 次、触发 ${navRun.navSets.toFixed(0)} 次 NAV 设置——作弊者离 AP 近、用的 MCS 高，邻居的 SINR 达不到那个 MCS 的解码门限（与帧长无关），读不到 Duration 就不会被骗。`
  out.push(`<li><b>TXOP 霸占对只打游戏的作弊者无用；NAV 膨胀${navWorks ? '有效与否取决于邻居能否解码它的帧' : '同样无用'}。</b>${hogText}${navText}作弊者自己也在云备份时，它的 1500 B A-MPDU 超过 RTS 门限，每个突发都以 24 Mb/s 的 RTS 开头——RTS 的 Duration 同样被膨胀，而且所有邻居都能解码它：该场景 8 s 里 ${fuNavRun.navSetsRts.toFixed(0)} 次 NAV 设置来自作弊者的 RTS，${fuNavRun.navSets.toFixed(0)} 次来自其数据帧。TXOP 霸占让合规玩家 ${ms(fuB.gamers)} → ${ms(fuHog.gamers)}，NAV 膨胀让合规玩家 ${ms(fuB.gamers)} → ${ms(fuNav.gamers)}、其他终端 ${ms(fuB.others)} → ${ms(fuNav.others)}，而作弊者自己的 ping 分别为 ${ms(fuHog.cheater)} 与 ${ms(fuNav.cheater)}（基线 ${ms(fuB.cheater)}）。</li>`)

  // 5. the cheater that also uploads: mean barely moves, the tail does
  const fuRanked = cheats.map((c) => ({ c, s: S('full-upload', c) })).sort((a, b) => (a.s.cheaterP95 ?? 1e9) - (b.s.cheaterP95 ?? 1e9))
  const fuBest = fuRanked[0]
  const lo = Math.min(...cheats.map((c) => S('full-upload', c).cheater ?? 0)), hi = Math.max(...cheats.map((c) => S('full-upload', c).cheater ?? 0))
  const tails = cheats.map((c) => `${CONFIG_LABEL[c]} ${fmt(S('full-upload', c).cheaterP95, 0)}`).join('、')
  const better = cheats.filter((c) => (S('full-upload', c).cheaterP95 ?? 0) < (fuB.cheaterP95 ?? 0)).length
  const head5 = better === 0 ? '平均与尾部都没有收益' : better < cheats.length / 2 ? '平均 ping 变化不大，只有个别作弊改善了尾部' : '平均 ping 变化不大，尾部才是看点'
  const tail5 = better === 0
    ? `P95 在七种作弊下全都不低于基线（${tails} ms），最接近的是"${CONFIG_LABEL[fuBest.c]}"：${fmt(fuB.cheaterP95, 0)} → ${fmt(fuBest.s.cheaterP95, 0)} ms，最大 ${fmt(fuB.cheaterMax, 0)} → ${fmt(fuBest.s.cheaterMax, 0)} ms。作弊者自己的备份突发占着它的电台：每次 A-MPDU 突发的两三毫秒里，它的游戏包只能等自己发完，作弊改变不了自己的电台忙。`
    : `P95 在 ${better}/${cheats.length} 种作弊下低于基线（${tails} ms），最低的是"${CONFIG_LABEL[fuBest.c]}"：${fmt(fuB.cheaterP95, 0)} → ${fmt(fuBest.s.cheaterP95, 0)} ms，最大 ${fmt(fuB.cheaterMax, 0)} → ${fmt(fuBest.s.cheaterMax, 0)} ms。手游玩家感知到的"卡一下"正是这个尾部。`
  out.push(`<li><b>满屋子 + 作弊者云备份：${head5}。</b>该场景空口 ${fuB.busy.toFixed(0)}%，作弊者基线平均 ${ms(fuB.cheater)}（P95 ${fmt(fuB.cheaterP95, 0)}，最大 ${fmt(fuB.cheaterMax, 0)} ms），七种作弊的平均值都在 ${fmt(lo)}–${fmt(hi)} ms 之间。${tail5}</li>`)

  // 6. who can detect what (static)
  out.push(`<li><b>检测责任分工。</b>优先级抬升、TXOP 霸占、NAV 膨胀和贪婪都留下 AP 单独可测的硬证据（TID、TXOP 时长、Duration 字段）；AIFS 地板与 CW 坍缩只在<em>发送时刻分布</em>上留痕，AP 的介质视角与作弊者不同，需要统计样本，合规终端的旁证有帮助但不是必需；不加倍要靠重传帧前的等待，而碰撞事件本身 AP 看不见，把碰撞归因到作弊者需要合规终端报告的重传率。详见第 3 节。</li>`)
  return `<ol>${out.join('')}</ol>`
}

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

const nPings = RUN_MS / 1000 * 4 * SEEDS.length

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EDCA 篡改驱动对手游时延的影响与检测</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; background: #fcfcfb; color: #1f1f1e; font: 14px/1.6 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
  main { max-width: 1240px; margin: 0 auto; padding: 32px 28px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 40px 0 12px; border-bottom: 1px solid #e3e3df; padding-bottom: 6px; }
  h3 { font-size: 15px; margin: 24px 0 8px; }
  p { margin: 6px 0 10px; }
  .lede { color: #555; margin-bottom: 20px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #e3e3df; padding: 6px 8px; vertical-align: top; text-align: left; }
  th { background: #f3f3f0; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.main td { font-size: 12.5px; }
  table.main p { margin: 6px 0 0; }
  table.inner { font-size: 12px; }
  table.inner th, table.inner td { padding: 3px 6px; }
  table.inner td.scen { white-space: nowrap; color: #444; }
  td.impact { padding: 4px; }
  table.detail td, table.detail th { font-size: 12px; }
  .wrap { overflow-x: auto; }
  .muted { color: #777; }
  .small { font-size: 11.5px; }
  .mono { font-family: Consolas, "SFMono-Regular", Menlo, monospace; font-size: 11px; }
  .tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
  .tag.ok { background: #e2f3ea; color: #0d6b3a; }
  .tag.warn { background: #fdecd9; color: #a04a0a; }
  .d { font-size: 11.5px; white-space: nowrap; }
  .d.down { color: #0d6b3a; }
  .d.up { color: #a02a2a; }
  .d.flat { color: #777; }
  .weak { color: #a04a0a; }
  .chart { display: block; max-width: 100%; height: auto; margin: 8px 0 4px; }
  figure { margin: 12px 0 20px; }
  figcaption { font-size: 12px; color: #666; }
  code { font-family: Consolas, Menlo, monospace; font-size: 12px; background: #f1f1ee; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f1f1ee; padding: 10px 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
  ol li, ul li { margin: 4px 0; }
</style>
</head>
<body>
<main>
<h1>EDCA 篡改驱动对手游时延的影响与检测</h1>
<p class="lede">七种违反 IEEE 802.11 EDCA 参数的终端"作弊"方式：原理、检测方法、AP 能否单独发现，以及在四个手游场景中对作弊者与合规终端 ping 的仿真影响。数据来自本仓库的确定性仿真引擎（µs 级 DCF/EDCA，含真实往返的云服务器）。生成时间 ${new Date().toISOString().slice(0, 10)}。</p>

<h2>1 · 主要结论</h2>
${findings()}

<h2>2 · 实验设置</h2>
<p>作弊者固定为节点 <code>${CHEATER}</code>——三人开黑场景中的 <b>${cheaterName}</b>、满屋子场景中的 <b>${cheaterNameFull}</b>——在四个场景里都是一名手游玩家（满屋子里它同时在看视频）。手游业务按 2026-09-09 实测的王者荣耀对局建模（华为手机经 USB 网络报文镜像抓取，10 分钟对局）：上行约 33 帧/s、89–131 B（IP 包长），帧间隔取自实测直方图（10–20 ms 主峰、60–70 ms 次峰、16% 背靠背、1% 为 200–320 ms 停顿）；下行为服务器每 65 ms（±3 ms）一个 133–203 B 状态更新，约五分之一的周期另附一个 52–76 B 小包；双向合计约 35 kb/s。AC_BE（路由器未开游戏加速）。电台按机型预设建模：手机以 160 MHz、2 空间流工作，接入点为 160 MHz、4 流；满屋子场景里的电视、笔记本、传感器等家电按各自世代的典型规格取值（Wi-Fi 5/6 为 80 MHz、2 流，Wi-Fi 7 为 160 MHz、2 流，非 HT 传感器为 20 MHz、1 流）——空口占用与各配置下的速率因此反映的是一条真实的 Wi-Fi 7 链路，而不是早期版本里 20 MHz、单流的电台。实测腾讯服务器往返中位 49 ms、离散约 20 ms，本报告仍用 25 ms 国内服务器预设。ping 的定义与游戏内显示的一致：每秒 4 次 64 B 探测，Wi-Fi 上行 + WAN（游戏服务器基准 25 ms，抖动 3 ms，处理 2 ms）+ Wi-Fi 下行。每个配置运行 ${SEEDS.length} 个随机种子（${SEEDS.join('、')}）× ${RUN_MS / 1000} s，合并为每个终端约 ${nPings} 个游戏 ping 样本；表中给出平均值、P95 与最大值。同时看视频的终端，其视频服务器的往返单独统计，不混入游戏 ping。</p>
<div class="wrap">${scenarioSetupTable()}</div>
<p class="small muted">"合规玩家"为除作弊者外所有运行手游业务的终端，取其游戏 ping；"其他合规终端"为除作弊者外所有有非游戏服务器往返测量的终端（视频、通话、网页、传感器），其 RTT 是各自应用的往返。碰撞事件按次计（一次两帧相撞记 1 次，不按卷入的节点数累加）。空口占用为所有节点发送时间之和占仿真时长的比例，饱和上传场景下因帧重叠可超过 100%。</p>

<h2>3 · 作弊方式总表</h2>
<p>每种作弊的参数、留下的可观测痕迹、检测责任归属，以及四个场景中"基线 → 作弊"的平均 RTT 变化。绿色为下降、红色为上升、灰色为 ±5% 以内。</p>
<div class="wrap">${mainTable()}</div>

<h3>展开：为什么"不加倍"需要合规终端协助</h3>
<p>这种作弊的全部内容都发生在碰撞之后。合规终端每失败一次就把竞争窗口加倍，碰撞后要等更久才重发；作弊者的窗口钉在最小值，碰撞后很快重发，于是几乎每一次"再竞争"都是它赢。要抓它，就得看碰撞之后发生了什么——而碰撞恰恰是 AP 看不见的东西。</p>
<p><b>AP 能看到什么。</b>AP 只收到解码成功的帧。一次碰撞是两个帧在 AP 天线上重叠，通常两个都解不出来：AP 听到的是一段能量或一堆没有合法地址的乱码。它知道空口出了问题，却不知道是谁、甚至不能确定这是碰撞而不是一次噪声。</p>
<p><b>AP 独自能做的尝试。</b>重传帧带着 Retry 位，所以一个 Retry=1 的帧到达时，AP 知道这台终端刚刚失败过一次，可以量它重传前等了多久，与首发帧的等待分布比较：合规终端的重传平均要等约两倍长，作弊者的重传与首发一模一样。问题在于这需要大量重传样本。轻载家庭里全屋每秒只有几次碰撞，作弊者每分钟只留下寥寥几个重传样本，而且 AP 并不知道终端的退避是何时开始的，它量到的"等待"本身就带噪声。几个样本分不清"作弊所以短"和"运气好所以短"。</p>
<p><b>合规终端知道而 AP 不知道的事。</b>每台终端都精确知道自己何时发了帧、何时没收到 ACK——那就是它亲身参与的一次碰撞，带时间戳、从内部看到的。AP 看不见碰撞，参与碰撞的终端却看得见。一旦合规终端上报自己的重传记录，两件事变得可能：</p>
<ul>
  <li><b>碰撞事件被还原。</b>终端 A 和终端 C 都报告在同一时刻失败了一次，AP 就知道那一刻发生了碰撞、参与者是谁。匿名的乱码变成了有主的事件。</li>
  <li><b>碰撞后的胜率可以度量。</b>参与者已知，AP 就能核对每次碰撞后谁先发出了下一帧。公平竞争下每个参与者的机会大致均等；某台终端在几十次事件里八九成都先发，它就没有在加倍。这个统计量就是指纹——而它只有在合规一方告诉 AP"我输掉了哪些碰撞"之后才存在。</li>
</ul>
<p>可以把它想成一个装了摄像头的四向停车路口。摄像头看得见顺利通过的车，也看得见几次模糊的险情，却说不出险情该算在谁头上。那些不断被抢道的司机，每一位都记得自己刹车重试了多少次。把他们的投诉并排放在一起，就能看出哪辆车总在每次险情的中心、而且每次险情之后总是它先走。摄像头独自说不出这一点，受害者能。</p>

<h2>4 · 各场景的 ping 对比图</h2>
${EXPERIMENTS.map((e) => `<figure>${rttChart(e.id)}<figcaption>${e.title}：八种配置下作弊者与合规玩家均值的平均游戏 ping。作弊者的数值直接标注；悬停条形可见每个值，完整数据见第 5 节。</figcaption></figure>`).join('')}

<h2>5 · 完整数据</h2>
${EXPERIMENTS.map((e) => `<h3>${e.title}</h3><div class="wrap">${detailTable(e.id)}</div>`).join('')}

<h2>6 · 方法与局限</h2>
<ul>
  <li><b>引擎。</b>事件驱动、整数纳秒时钟；DCF/EDCA（Table 9-194 参数）、A-MPDU/BlockAck、TXOP、RTS/CTS、NAV、OFDMA、MLO；传播为对数距离 + 墙体损耗，前导检测 −82 dBm、能量检测 −62 dBm，同时起始按信号强度判定捕获。篡改驱动通过 <code>NodeCfg.tamper</code> 覆盖该终端的 EDCA 参数（<code>effectiveParams</code>），并在其发出的 Duration 字段上加膨胀量。</li>
  <li><b>作弊者只有一个。</b>报告回答"一台越权终端能得到什么、让别人付出什么"；多台作弊者互相竞争是另一个问题。</li>
  <li><b>NAV 膨胀的效果取决于解码，而本引擎的解码模型偏保守。</b>引擎按每个 MCS 的 SINR 门限判定一帧能否解码，解不出就不读 Duration（只得到 EIFS）；数据帧的 MCS 由作弊者到 AP 的链路决定，邻居能否解码常在零点几 dB 之间，因此同一作弊在不同位置的效果可以从"完全无效"到"压住全屋"。第 1 节给出了本次运行的解码与 NAV 计数。真实的 Wi-Fi 6/7 终端即使解不出载荷，也会按 HE/EHT 前导中的 TXOP_DURATION 更新 NAV（IEEE 802.11-2024 §26.2.4），本引擎未建模这一点，所以对"解不出就骗不到"的结论应打折扣。</li>
  <li><b>样本量与离群值。</b>ping 每秒 4 次，单个 3 s 运行只有 11 个样本，一次 300 ms 的异常值就能把均值抬高 25 ms；因此改为 ${SEEDS.length} 个种子 × ${RUN_MS / 1000} s 并合并样本。即便如此，一个种子里的一次长时延仍能左右合并均值，所以第 3 节每个变化都标注了"n/${SEEDS.length} 种子同向"（悬停可见各种子的值），第 1 节的结论只采用所有种子同向的变化；P95 与最大值是单点统计，解读时注意。</li>
  <li><b>"满屋子人"与"满屋子人 + 作弊者同时云备份"在新电台下已不再受空口约束，第 3、5 节里这两个场景的作弊间差异多数落在噪声量级。</b>这两个场景没有持续饱和的上行流，只是六部手机、一台电视和一个传感器的日常混合使用；旧的 20 MHz、单流电台把这份真实业务量发送得慢，空口因此顶到 60–70%，产生的是电台慢造成的伪竞争。换成真实的 160/160 MHz、2–4 流电台后，同样的业务量占用的空口骤降到 ${get('full', 'baseline').busyPct.toFixed(0)}%（满屋子人）与 ${get('full-upload', 'baseline').busyPct.toFixed(0)}%（+ 云备份），七种作弊之间的平均 ping 差异随之缩到亚毫秒级——如第 1 节所见，这不是作弊失效，而是这一负载强度下电台本身已经快到不再产生可观测的排队延迟。本报告里对"抢竞争类作弊有实效"的实证证据，主要来自仍然饱和的场景 2（两台笔记本饱和上传，八种配置下空口占用都在 98%–107% 之间，基线 ${get('bg-upload', 'baseline').busyPct.toFixed(0)}%）；读者不应把场景 3、5 里的"没有差异"当成"这种作弊在真实家庭网络里普遍无效"的证据，它只对这两个具体场景、这一具体负载强度成立。</li>
  <li><b>本实验暴露并修复的两个引擎缺陷。</b>（1）AP 发完一个下行 MU PPDU、收齐所有 BlockAck 后，原引擎还要再等 45 µs 的应答超时才结算这次交换、再等 SIFS 才续发——TXOP 持有者每次 MU 后空等 61 µs，比任何类别的 AIFS 都长，任何终端都可以合法地插进来。现在收齐最后一个 BlockAck 就立即结算。（2）被插入一个必须应答的帧（作弊者的 RTS）时，原引擎同时保留"续发"与"应答"两个定时器，第二个在自己发送中途触发 <code>startTx while transmitting</code>；现在收到必须应答的帧会取消续发并结束 TXOP，续发定时器触发时若 CCA 忙也会放弃。按 §10.3.2.9，被 RTS 点名的终端只要 NAV 空闲就应答 CTS，持有者自己的帧不设置自己的 NAV，所以应答是合规的；而在单次保护下持有者的 TXNAV 在 BlockAck 结束时已经到期，放弃 TXOP 也合规。</li>
</ul>
<h3>复现</h3>
<pre>npx vite-node scripts/tamper-report.ts --dump &gt; tamper-pooled.json
npx vite-node scripts/tamper-report-html.ts tamper-pooled.json docs/reports/edca-tamper-report.zh.html</pre>
</main>
</body>
</html>
`
writeFileSync(outPath, html)
console.error(`wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB)`)
