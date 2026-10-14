/**
 * The feature map as a standalone page (Chinese, self-contained, no CDN):
 *
 *   npx vite-node scripts/feature-graph-html.ts [out.html]
 *
 * The app has this screen too — `src/ui/FeatureMap.tsx`, the 🗺 tab — and **both read the same
 * module**: `src/course/featureGraph.ts` parses the two coverage documents and lays the spine out.
 * This file is the version you can send to somebody who is not going to run a dev server, and
 * nothing in it decides anything: no spine, no row, no count.
 *
 * It needs `vite-node` rather than `tsx` for one reason: the data comes from `?raw` imports of the
 * two Markdown documents, which is Vite's resolution, not Node's.
 */
import { writeFileSync } from 'node:fs'
import {
  BOX_H, BOX_W, DOC_PATH, graphFor, wrapCjk, type FeatureGroup, type StatusKind, type Track,
} from '../src/course/featureGraph'
import { LESSONS } from '../src/course/lessons'
import { trackOf } from '../src/course/curriculum'

const OUT = process.argv[2] ?? 'docs/reports/feature-graph.zh.html'
const TRACKS: Track[] = ['wifi', 'uwb']
const TRACK_NAME: Record<Track, string> = { wifi: 'Wi-Fi', uwb: 'UWB' }

const FAMILY_NAME: Record<FeatureGroup['family'], string> = {
  core: '已发布标准的主干', draft: '草案／提案', derived: '派生：标准里没有条款',
  absent: '整块缺席（范围决定）',
}
const KIND_NAME: Record<StatusKind, string> = {
  published: '已发布', draft: '已进草案', contested: '仍在争论', unsettled: '无法判定',
  none: '标准不规定',
}
const KINDS: StatusKind[] = ['published', 'draft', 'contested', 'unsettled', 'none']
const ENGINE = ['已建模', '部分建模', '未建模'] as const

const esc = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const md = (s: string): string => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')

const lessonsOf = (track: Track): string[] =>
  LESSONS.filter((l) => trackOf(l) === track).map((l) => l.id)

function section(track: Track): string {
  const g = graphFor(track, lessonsOf(track))
  const nodes = g.boxes.map(({ group, x, y }) => {
    let run = 0
    const bar = ENGINE.map((e) => {
      const n = group.rows.filter((r) => r.engine === e).length
      if (n === 0) return ''
      const w = (n / group.rows.length) * (BOX_W - 24)
      const out = `<rect class="seg ${e}" x="${(12 + run).toFixed(1)}" y="${BOX_H - 22}"`
        + ` width="${w.toFixed(1)}" height="8" rx="4"></rect>`
      run += w
      return out
    }).join('')
    const note = wrapCjk(group.note, 15, 2)
      .map((line, i) => `<text class="n dim" x="12" y="${58 + i * 14}">${esc(line)}</text>`).join('')
    return `<g class="node ${group.family}" data-id="${track}-${group.id}"
      transform="translate(${x},${y})">
      <title>${esc(group.title)}　${esc(group.note)}</title>
      <rect class="box" width="${BOX_W}" height="${BOX_H}" rx="10"></rect>
      <text class="t" x="12" y="22">${esc(group.title)}</text>
      <text class="n" x="12" y="40">${group.rows.length} 行 · ${group.lessons.length} 课</text>
      ${note}
      ${group.open === 0 ? '' : `<circle class="open" cx="${BOX_W - 18}" cy="16" r="8"></circle>`
        + `<text class="openn" x="${BOX_W - 18}" y="20">${group.open}</text>`}
      ${bar}
    </g>`
  }).join('\n')

  const panels = g.groups.map((group) => `<div class="panel" id="p-${track}-${group.id}">
    <h3>${esc(group.title)}</h3>
    <p class="note">${esc(group.note)}</p>
    <p class="note">课：${group.lessons.length === 0 ? '（无）'
      : group.lessons.map((x) => `<code>@${esc(x)}</code>`).join('、')}</p>
    ${group.needs.length === 0 ? '<p class="note">依赖：（无，这一组是一条链的起点）</p>'
      : `<ul class="deps">${group.needs.map((n) =>
        `<li><b>${esc(g.groups.find((x) => x.id === n.id)!.title)}</b>　${esc(n.why)}</li>`)
        .join('')}</ul>`}
    ${(() => {
      const fed = g.groups.filter((x) => x.needs.some((n) => n.id === group.id))
      return fed.length === 0 ? ''
        : `<p class="note">它撑着：${fed.map((x) => esc(x.title)).join('、')}</p>`
    })()}
    <table><thead><tr><th>特性</th><th>标准</th><th>引擎</th></tr></thead><tbody>
    ${group.rows.map((r) => `<tr>
      <td>${md(r.feature)}<div class="ev">${md(r.evidence)}</div></td>
      <td><span class="tag k-${r.statusKind}">${esc(r.status)}</span></td>
      <td><span class="tag e-${r.engine}">${esc(r.engine)}</span></td>
    </tr>`).join('')}
    </tbody></table>
  </div>`).join('\n')

  return `<section class="view" id="v-${track}">
    <div class="totals">
      ${g.engineCounts.map(([e, n]) => `<div><span class="tag e-${e}">${e}</span> ${n} 行</div>`).join('')}
      ${KINDS.map((k) => {
        const n = g.rows.filter((r) => r.statusKind === k).length
        return n === 0 ? '' : `<div><span class="tag k-${k}">${KIND_NAME[k]}</span> ${n} 行</div>`
      }).join('')}
    </div>
    <div class="scroller"><svg width="${g.width}" height="${g.height}"
      viewBox="0 0 ${g.width} ${g.height}">
      ${g.edges.map((e) => `<path class="edge" d="${e.d}"><title>`
        + `${esc(g.groups.find((x) => x.id === e.from)!.title)} → `
        + `${esc(g.groups.find((x) => x.id === e.to)!.title)}　${esc(e.why)}`
        + '</title></path>').join('\n')}
      ${nodes}
    </svg></div>
    ${panels}
    ${g.orphanLessons.length === 0 ? '' : `<div class="orphans">
      <b>${g.orphanLessons.length} 门课在这张覆盖表里没有对应的特性行</b>
      <p class="note">UWB 那张表是穷举的，所以它这一格必须是空的；Wi-Fi 那张表自己写明不枚举整部
      标准，所以项目课、模型对照课与「一份测量怎么成为文稿」这类课本来就没有特性行——而其中有
      一门是真的缺口：第五个代次 <code>uhr</code> 已经落地，覆盖表的物理层参数那一节还停在 EHT。</p>
      <p>${g.orphanLessons.map((x) => `<code>@${esc(x)}</code>`).join(' ')}</p>
    </div>`}
    <p class="note">这一节现算自 <code>${DOC_PATH[track]}</code> 与课程本身，不存第二份数据。</p>
  </section>`
}

const counts = TRACKS.map((t) => {
  const g = graphFor(t, lessonsOf(t))
  return `${TRACK_NAME[t]} ${g.rows.length} 行 / ${g.groups.length} 组`
}).join('　·　')

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>特性图谱：标准、草案、本仿真器与课程</title>
<style>
  :root {
    --bg: #0f1216; --fg: #e8ecf1; --dim: #96a0ad; --line: #2a3340; --card: #161b22;
    --core: #4aa3ff; --draft: #b07cff; --derived: #8a93a3; --absent: #4b5563;
    --contested: #ff8a4a; --full: #35c08a; --part: #e0b341; --none: #4b5563;
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      --bg: #fbfcfd; --fg: #11161c; --dim: #5b6875; --line: #d7dee7; --card: #fff; --none: #b6bec9;
    }
  }
  * { box-sizing: border-box }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.6 "Segoe UI", system-ui,
    "Noto Sans SC", "Microsoft YaHei", sans-serif }
  header, main, footer { max-width: 1100px; margin: 0 auto; padding: 0 16px }
  header { padding-top: 20px } h1 { font-size: 20px; margin: 0 0 6px }
  .sub { color: var(--dim); font-size: 13px; margin: 0 0 12px }
  .tabs { display: flex; gap: 8px; margin: 10px 0 }
  .tabs button { background: var(--card); color: var(--fg); border: 1px solid var(--line);
    border-radius: 8px; padding: 7px 14px; font: inherit; cursor: pointer }
  .tabs button[aria-selected="true"] { border-color: var(--core); color: var(--core) }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; margin: 8px 0 }
  .sw { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px }
  .totals { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 }
  .totals div { border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px;
    font-size: 12.5px; background: var(--card) }
  .scroller { overflow: auto; border: 1px solid var(--line); border-radius: 12px;
    background: var(--card); max-height: 70vh }
  svg { display: block }
  .box { fill: var(--card); stroke: var(--line); stroke-width: 1.5 }
  .node.core .box { stroke: var(--core) } .node.draft .box { stroke: var(--draft) }
  .node.derived .box { stroke: var(--derived) } .node.absent .box { stroke: var(--absent) }
  .node { cursor: pointer } .node:hover .box, .node.sel .box { stroke-width: 3 }
  text.t { fill: var(--fg); font-size: 13px; font-weight: 600 }
  text.n { fill: var(--dim); font-size: 11px } text.dim { opacity: .85 }
  .edge { fill: none; stroke: var(--line); stroke-width: 1.5 }
  .seg.已建模 { fill: var(--full) } .seg.部分建模 { fill: var(--part) }
  .seg.未建模 { fill: var(--none) }
  circle.open { fill: var(--contested); opacity: .92 }
  text.openn { fill: #0f1216; font-size: 10.5px; font-weight: 700; text-anchor: middle }
  .panel { display: none; margin-top: 16px; border: 1px solid var(--line); border-radius: 12px;
    background: var(--card); padding: 14px 16px }
  .panel.on { display: block } .panel h3 { margin: 0 0 4px; font-size: 16px }
  .note { color: var(--dim); font-size: 12.5px; margin: 2px 0 8px }
  table { width: 100%; border-collapse: collapse; font-size: 13px }
  th, td { text-align: left; vertical-align: top; padding: 8px; border-top: 1px solid var(--line) }
  th { color: var(--dim); font-size: 12px }
  .ev { color: var(--dim); font-size: 12px; margin-top: 4px }
  code { background: rgba(127,127,127,.14); padding: 0 4px; border-radius: 4px;
    font-family: ui-monospace, Consolas, monospace; font-size: 12px }
  .tag { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 11.5px;
    white-space: nowrap; border: 1px solid }
  .tag.k-published { color: var(--core); border-color: var(--core) }
  .tag.k-draft { color: var(--draft); border-color: var(--draft) }
  .tag.k-contested { color: var(--contested); border-color: var(--contested) }
  .tag.k-unsettled, .tag.k-none { color: var(--derived); border-color: var(--derived) }
  .tag.e-已建模 { color: var(--full); border-color: var(--full) }
  .tag.e-部分建模 { color: var(--part); border-color: var(--part) }
  .tag.e-未建模 { color: var(--dim); border-color: var(--none) }
  ul.deps { margin: 4px 0 10px; padding-left: 18px; color: var(--dim); font-size: 12.5px }
  ul.deps b { color: var(--fg) }
  .orphans { margin-top: 16px; border: 1px dashed var(--line); border-radius: 12px;
    padding: 12px 16px; background: var(--card) }
  .view { display: none } .view.on { display: block }
  footer { color: var(--dim); font-size: 12px; padding-bottom: 48px }
</style></head><body>
<header>
  <h1>特性图谱：标准怎么说，草案提了什么，本仿真器建到哪一步</h1>
  <p class="sub">${counts}。框是特性组，箭头是「它得先成立」；颜色是组的家族，组底下那条带子是
    组里各行的引擎状态。点一个框看它的行。这一页与仿真器里的 🗺 图谱是同一份数据、同一条骨架
    （<code>src/course/featureGraph.ts</code>），两份覆盖表现算而来，不存第二份数据。</p>
  <div class="legend">
    ${(Object.keys(FAMILY_NAME) as FeatureGroup['family'][]).map((f) =>
      `<span><span class="sw" style="background:var(--${f})"></span>${FAMILY_NAME[f]}</span>`).join('')}
    <span><span class="sw" style="background:var(--full)"></span>已建模</span>
    <span><span class="sw" style="background:var(--part)"></span>部分建模</span>
    <span><span class="sw" style="background:var(--none)"></span>未建模</span>
    <span><span class="sw" style="background:var(--contested);border-radius:50%"></span>仍在争论／无法判定</span>
  </div>
  <div class="tabs">
    ${TRACKS.map((t, i) => `<button id="t-${t}" aria-selected="${i === 0}">${TRACK_NAME[t]}</button>`).join('')}
  </div>
</header>
<main>
  ${TRACKS.map((t) => section(t)).join('\n')}
</main>
<footer>
  <p>两条证据边界照两份覆盖表的原话：4ab 那一列的状态来自一份截至 2026 年 9 月下旬的 TG4ab 文稿
  语料库（当前草案 D05，SA 投票复审中），草案正文会员限定，本仓库一个字也没抄；「本仿真器」那一
  列读的是代码，不是课文。这张图继承那两条边界，不会比它们更硬。</p>
  <p>重新生成：<code>npx vite-node scripts/feature-graph-html.ts</code>。骨架与分组规则在
  <code>src/course/featureGraph.ts</code>，而 <code>tests/course/feature-graph.test.ts</code> 盯着
  三件事：每一行都归到恰好一组、没有空组、以及每一门课都被某一行引到。</p>
</footer>
<script>
  const byId = (s) => document.getElementById(s)
  for (const n of document.querySelectorAll('.node')) {
    n.addEventListener('click', () => {
      const on = n.classList.contains('sel')
      for (const x of document.querySelectorAll('.node')) x.classList.remove('sel')
      for (const p of document.querySelectorAll('.panel')) p.classList.remove('on')
      if (on) return
      n.classList.add('sel')
      const p = byId('p-' + n.dataset.id)
      p.classList.add('on')
      p.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }
  const tracks = ${JSON.stringify(TRACKS)}
  const show = (which) => {
    for (const t of tracks) {
      byId('t-' + t).setAttribute('aria-selected', String(t === which))
      byId('v-' + t).classList.toggle('on', t === which)
    }
    for (const p of document.querySelectorAll('.panel')) p.classList.remove('on')
    for (const x of document.querySelectorAll('.node')) x.classList.remove('sel')
  }
  for (const t of tracks) byId('t-' + t).addEventListener('click', () => show(t))
  show(tracks[0])
</script>
</body></html>
`

writeFileSync(OUT, html, 'utf8')
for (const t of TRACKS) {
  const g = graphFor(t, lessonsOf(t))
  console.log(`${TRACK_NAME[t]}: ${g.rows.length} rows, ${g.groups.length} groups,`
    + ` ${g.orphanLessons.length} uncited lesson(s)`)
}
console.log(`→ ${OUT}`)
