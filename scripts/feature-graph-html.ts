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
  BASELINE, DOC_PATH, graphFor,
  type DocGist, type FeatureGroup, type StatusKind, type Track,
} from '../src/course/featureGraph'
import orgLogos from '../src/course/orgLogos.json'
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
const DOC_KIND: Record<string, string> = {
  proposal: '投稿', cr: '意见决议', pdt: '草案文字提案', sfd: '规范框架文件', draft: '草案',
  agenda: '议程', 'closing-report': '闭幕报告', minutes: '会议纪要',
  'comments-sheet': '意见汇总表', simulation: '仿真',
  usecase: '用例', tgd: '技术指南文件', process: '流程', 'motion-dock': '动议清单',
  timeline: '时间表',
}
const ORG_LOGOS = orgLogos.logos as Record<string, { slug: string; hex: string; path: string }>

/**
 * One company's mark, or its initials when simple-icons has none. Always on a white tile: Apple
 * and NXP draw themselves in black, and this page has a dark theme too.
 */
function orgMark(name: string, size = 15, docs?: number): string {
  const title = esc(`${name}${docs === undefined ? '' : `　${docs} 篇文稿`}`)
  const logo = ORG_LOGOS[name]
  if (logo === undefined) {
    return `<span class="chip" title="${title}" style="background:${orgColor(name)};`
      + `width:${size}px;height:${size}px;line-height:${size}px;font-size:${size * 0.53}px"`
      + `>${esc(orgInitials(name))}</span>`
  }
  return `<span class="mark" title="${title}" style="width:${size}px;height:${size}px">`
    + `<svg width="${size - 3}" height="${size - 3}" viewBox="0 0 24 24" aria-label="${title}">`
    + `<path d="${logo.path}" fill="${logo.hex}"></path></svg></span>`
}

/** What a document did, in counted facts — the same line the app draws. */
function gistLine(gist: DocGist | undefined): string {
  if (gist === undefined) return ''
  const parts: string[] = []
  if (gist.clause !== undefined) parts.push(`§${gist.clause}`)
  if (gist.cids !== undefined) parts.push(`${gist.cids} 条意见`)
  const verdicts = [
    gist.acc === undefined ? '' : `接受 ${gist.acc}`,
    gist.rev === undefined ? '' : `修订 ${gist.rev}`,
    gist.rej === undefined ? '' : `否决 ${gist.rej}`,
  ].filter((x) => x !== '')
  if (verdicts.length > 0) parts.push(`${verdicts.join('／')} 字样`)
  return parts.join(' · ')
}

/** The same hash-to-hue the app uses, so a company is the same colour in both. */
const ORG_HUES = [206, 268, 152, 24, 340, 48, 188, 292, 120, 8]
function orgColor(name: string): string {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 100000
  return `hsl(${ORG_HUES[h % ORG_HUES.length]} 52% 46%)`
}
function orgInitials(name: string): string {
  const words = name.split(/[\s.,-]+/).filter((w) => w !== '')
  if (words.length >= 2 && /^[A-Za-z]/.test(words[0]!)) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const esc = (s: string): string => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const md = (s: string): string => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')

const lessonsOf = (track: Track): string[] =>
  LESSONS.filter((l) => trackOf(l) === track).map((l) => l.id)

const COL_W = 158
const OPEN_W = 376
const GUTTER = 84
const DOC_KIND_SHORT: Record<string, string> = {
  proposal: '投稿', cr: '决议', pdt: '文字', sfd: '框架', draft: '草案', agenda: '议程',
  'closing-report': '闭幕', minutes: '纪要', 'comments-sheet': '意见表', simulation: '仿真',
  usecase: '用例', tgd: '指南', process: '流程', 'motion-dock': '动议', timeline: '日程',
}

function section(track: Track): string {
  const g = graphFor(track, lessonsOf(track))

  const head = g.columns.map((c, i) => {
    const bar = ENGINE.map((e) => {
      const n = c.group.rows.filter((r) => r.engine === e).length
      return n === 0 ? '' : `<span class="seg ${e}" style="flex:${n}"></span>`
    }).join('')
    const shown = c.group.orgs.slice(0, 5)
    const more = c.group.orgs.slice(5)
    const chips = shown.map((o) => orgMark(o.name, 15, o.docs)).join('')
      + (more.length === 0 ? ''
        : `<span class="chip more" title="${esc(more.map((o) => o.name).join('、'))}">+${more.length}</span>`)
    const deps = c.group.needs.length === 0 ? '<p class="note">依赖：（无，这是一条链的起点）</p>'
      : `<ul class="deps">${c.group.needs.map((n) =>
        `<li><b>${esc(g.groups.find((x) => x.id === n.id)!.title)}</b>　${esc(n.why)}</li>`)
        .join('')}</ul>`
    const fed = g.groups.filter((x) => x.needs.some((n) => n.id === c.group.id))
    const when = c.group.since === null
      ? `<p class="note">时间：${c.group.era === BASELINE
        ? '已发布标准——这一带的行是拿已发布条款讲话的，而本仓库的语料库定不出它们各自是哪一版'
          + '修正案带进来的，所以它们共用最上面那一行，而不是由我编一个年份。'
        : '标准里没有条款可对，只有本引擎的模型，所以它唯一的日期是本仓库写下那门课的那一天。'}</p>`
      : `<p class="note">时间：首见 ${c.group.since}，最近 ${c.group.until}，`
        + `共 ${c.events.length} 件事。</p>`
    const orgs = c.group.orgs.length === 0 ? ''
      : `<p class="note">文稿上的单位：${c.group.orgs.map((o) =>
        `<span class="org">${orgMark(o.name, 15)}${esc(o.name)} ×${o.docs}</span>`).join(' ')}
        <br>这是这一组引用到的文稿上印着的作者单位——谁写了那份投稿或那条意见决议，不是谁发明了
        它，也不是到场讨论过的全部单位。议程、纪要、闭幕报告与意见汇总表只算日期、不算单位。</p>`
    return `<div class="head ${c.group.family}" data-col="${i}" data-id="${track}-${c.group.id}">
      <div class="t">${esc(c.group.title)}${c.group.open === 0 ? ''
        : `<span class="open" title="组里有几行还在争论或无法判定">${c.group.open}</span>`}</div>
      <div class="n">${c.group.rows.length} 行 · ${c.group.lessons.length} 课</div>
      <div class="bar">${bar}</div>
      <div class="chips">${chips}</div>
      <div class="card">
        <p class="note">${esc(c.group.note)}</p>
        ${when}
        ${orgs}
        ${deps}
        ${fed.length === 0 ? '' : `<p class="note">它撑着：${fed.map((x) => esc(x.title)).join('、')}</p>`}
        <p class="note">课：${c.group.lessons.length === 0 ? '（无）'
          : c.group.lessons.map((x) => `<code>@${esc(x)}</code>`).join('、')}</p>
        <details><summary>这一组的 ${c.group.rows.length} 行特性与证据</summary>
        <table><tbody>
        ${c.group.rows.map((r) => `<tr>
          <td>${md(r.feature)}<div class="ev">${md(r.evidence)}</div>
          <div><span class="tag k-${r.statusKind}">${esc(r.status)}</span>
          <span class="tag e-${r.engine}">${esc(r.engine)}</span></div></td>
        </tr>`).join('')}
        </tbody></table></details>
      </div>
    </div>`
  }).join('\n')

  const body = g.matrixRows.map((r, row) => {
    const label = r.key === BASELINE ? '已发布标准' : `${r.year} Q${r.quarter}`
    const cells = g.columns.map((c, i) => {
      const es = c.events.filter((e) => e.row === row)
      const inside = c.firstRow >= 0 && row >= c.firstRow && row <= c.lastRow
      const blocks = es.map((e) => {
        const gist = gistLine(e.gist)
        return `<div class="blk ${e.kind}" title="${esc(e.date === '' ? '已发布标准' : e.date)}　`
          + `${esc(e.label)}`
          + `${e.docKind === undefined ? '' : `　${esc(DOC_KIND[e.docKind] ?? e.docKind)}`}`
          + `${e.detail === '' ? '' : `　${esc(e.detail)}`}`
          + `${e.orgs.length === 0 ? '' : `　${esc(e.orgs.join('、'))}`}">`
          + '<div class="hd">'
          + `<span class="id">${esc(e.kind === 'published' ? '已发布标准' : e.label)}</span>`
          + `${e.docKind === undefined ? ''
            : `<span class="kd">${esc(DOC_KIND_SHORT[e.docKind] ?? e.docKind)}</span>`}`
          + `<span class="marks">${e.orgs.map((o) => orgMark(o, 11)).join('')}</span>`
          + '</div>'
          + `${gist === '' ? '' : `<div class="gist">${esc(gist)}</div>`}`
          + `${e.detail === '' ? '' : `<div class="ttl">${esc(e.detail)}</div>`}`
          + '</div>'
      }).join('')
      const lines = es.map((e) => (e.kind === 'published'
        ? '<div class="ev-line"><span class="dot published"></span><b>已发布标准</b></div>'
        : `<div class="ev-line"><span class="dot ${e.kind}"></span>`
          + `<code>${esc(e.date)}</code> <b>${esc(e.label)}</b>`
          + `${e.docKind === undefined ? '' : `　<span class="dim">${esc(DOC_KIND[e.docKind] ?? e.docKind)}</span>`}`
          + `${e.orgs.length === 0 ? '' : `　<span class="marks">${e.orgs.map((o) => orgMark(o, 13)).join('')}</span>`}`
          + `${gistLine(e.gist) === '' ? '' : `<div class="dim detail">${esc(gistLine(e.gist))}</div>`}`
          + `<div class="dim detail">${esc(e.detail)}</div></div>`)).join('')
      return `<div class="cell${inside ? ' lane' : ''}${r.events === 0 ? ' thin' : ''}"`
        + ` data-col="${i}">${blocks === '' ? '' : `<div class="blocks">${blocks}</div>`}`
        + `${lines === '' ? '' : `<div class="lines">${lines}</div>`}</div>`
    }).join('')
    return `<div class="rowlabel${r.events === 0 ? ' thin' : ''}`
      + `${r.quarter === 1 || r.key === BASELINE ? ' year' : ''}">${label}</div>${cells}`
  }).join('\n')

  return `<section class="view" id="v-${track}">
    <div class="totals">
      ${g.engineCounts.map(([e, n]) => `<div><span class="tag e-${e}">${e}</span> ${n} 行</div>`).join('')}
      ${KINDS.map((k) => {
        const n = g.rows.filter((r) => r.statusKind === k).length
        return n === 0 ? '' : `<div><span class="tag k-${k}">${KIND_NAME[k]}</span> ${n} 行</div>`
      }).join('')}
    </div>
    <div class="scroller">
      <svg class="arcs" id="a-${track}" width="${GUTTER + g.columns.length * COL_W}" height="34">
        <defs><marker id="ar-${track}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7"
          markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="currentColor"></path>
        </marker></defs>
      </svg>
      <div class="matrix" id="m-${track}" data-cols="${g.columns.length}"
        style="grid-template-columns:${GUTTER}px repeat(${g.columns.length}, ${COL_W}px)">
        <div class="corner">时间 ↓ ／ 特性 →</div>
        ${head}
        ${body}
      </div>
    </div>
    ${g.orphanLessons.length === 0 ? '' : `<div class="orphans">
      <b>${g.orphanLessons.length} 门课在这张覆盖表里没有对应的特性行</b>
      <p class="note">UWB 那张表是穷举的，所以它这一格必须是空的；Wi-Fi 那张表自己写明不枚举整部
      标准，所以项目课、模型对照课与「一份测量怎么成为文稿」这类课本来就没有特性行——而其中有
      一门是真的缺口：第五个代次 <code>uhr</code> 已经落地，覆盖表的物理层参数那一节还停在 EHT。</p>
      <p>${g.orphanLessons.map((x) => `<code>@${esc(x)}</code>`).join(' ')}</p>
    </div>`}
    <p class="note">这一节现算自 <code>${DOC_PATH[track]}</code>、课程本身，以及
    <code>src/course/docMeta.json</code> 与 <code>src/course/lessonMeta.json</code> 两份生成的
    日期表，不存第二份数据。</p>
  </section>`
}

/** `{track: {groupId: [{id, title, why}]}}` — the arcs the page draws when a column opens. */
const DEPS: Record<string, Record<string, { id: string; title: string; why: string }[]>> = {}
for (const t of TRACKS) {
  const g = graphFor(t, lessonsOf(t))
  DEPS[t] = Object.fromEntries(g.groups.map((x) => [x.id, x.needs.map((n) => ({
    id: n.id, title: g.groups.find((y) => y.id === n.id)!.title, why: n.why,
  }))]))
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
    background: var(--card); max-height: 74vh; position: relative }
  .arcs { display: block; color: var(--line) }
  .matrix { display: grid; font-size: 12px }
  .corner { position: sticky; left: 0; top: 0; z-index: 4; background: var(--card);
    border-right: 1px solid var(--line); border-bottom: 1px solid var(--line);
    padding: 6px 8px; color: var(--dim); font-size: 11px }
  .head { position: sticky; top: 0; z-index: 3; background: var(--card); cursor: pointer;
    align-self: start; padding: 6px 8px; border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line); border-top: 3px solid var(--line) }
  .head.core { border-top-color: var(--core) } .head.draft { border-top-color: var(--draft) }
  .head.derived { border-top-color: var(--derived) }
  .head.absent { border-top-color: var(--absent) }
  .head .t { font-weight: 600; font-size: 12px; line-height: 1.3 }
  .head .n { color: var(--dim); font-size: 10.5px; margin-top: 2px }
  .head .bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin: 4px 0 2px }
  .seg.已建模 { background: var(--full) } .seg.部分建模 { background: var(--part) }
  .seg.未建模 { background: var(--none) }
  .head .open { float: right; background: var(--contested); color: #111318; border-radius: 999px;
    font-size: 10px; font-weight: 700; padding: 0 5px }
  .chips { display: flex; gap: 2px; flex-wrap: wrap; margin-top: 3px }
  .chip { display: inline-block; width: 15px; height: 15px; border-radius: 4px; color: #fff;
    font-size: 8px; font-weight: 700; text-align: center; line-height: 15px }
  .chip.more { background: var(--derived) }
  .card { display: none } .head.on .card { display: block; max-height: 220px; overflow: auto;
    border-top: 1px solid var(--line); margin-top: 6px; padding-top: 6px; cursor: default }
  .head.on { background: rgba(127,127,127,.10) }
  .head.need { outline: 1px dashed var(--core); outline-offset: -2px }
  .rowlabel { position: sticky; left: 0; z-index: 2; background: var(--card); color: var(--dim);
    font-size: 11px; padding: 4px 8px; border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line) }
  .rowlabel.year { font-weight: 700 }
  .rowlabel.thin { font-size: 9.5px; padding: 0 8px; line-height: 12px; opacity: .6 }
  .cell { position: relative; min-height: 28px; padding: 2px 6px; cursor: pointer;
    border-right: 1px solid var(--line); border-bottom: 1px solid var(--line) }
  .cell.thin { min-height: 12px; padding: 0 }
  .cell.lane::before { content: ""; position: absolute; left: 3px; top: 0; bottom: 0; width: 2px;
    background: rgba(127,127,127,.38) }
  .cell.on { background: rgba(127,127,127,.10) }
  .blocks { display: grid; gap: 3px; padding-top: 2px }
  .blk { border-radius: 4px; padding: 2px 4px; font-size: 9.5px; line-height: 13px;
    overflow: hidden; background: rgba(127,127,127,.12); border-left: 3px solid var(--dim) }
  .blk .hd { display: flex; gap: 4px; align-items: center }
  .blk .marks { display: flex; gap: 2px; margin-left: auto }
  .blk .gist, .blk .ttl { color: var(--dim); font-size: 9px }
  .blk .ttl { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden }
  .mark { display: inline-flex; align-items: center; justify-content: center; border-radius: 4px;
    background: #fff; flex: 0 0 auto }
  .marks { display: inline-flex; gap: 3px; vertical-align: middle }
  .blk.published { border-left-color: var(--core) } .blk.doc { border-left-color: var(--draft) }
  .blk.lesson { border-left-color: var(--full) }
  .blk .id { font-family: ui-monospace, Consolas, monospace; white-space: nowrap }
  .blk .kd { color: var(--dim); white-space: nowrap }
  .chip.sm { width: 11px; height: 11px; border-radius: 3px; font-size: 6.5px; line-height: 11px;
    flex: 0 0 auto }
  .more { font-size: 9px; color: var(--dim); padding-left: 5px }
  .lines { display: none } .cell.on .lines { display: grid; gap: 3px; padding-left: 14px }
  .cell.on .blocks { display: none }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--dim) }
  .dot.published { background: var(--core) } .dot.doc { background: var(--draft) }
  .dot.lesson { background: var(--full) }
  .ev-line { font-size: 11px; line-height: 1.45 } .ev-line .dot { margin-right: 5px }
  .ev-line .detail { padding-left: 12px }
  .dim { color: var(--dim) }
  .org { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px }
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
  <p class="sub">${counts}。<b>一列一个特性，一行一个季度。</b>左右是特性进入记录的先后：先是
    已发布标准的那一批，再按被第一次提出的季度排草案里的，最后是标准里没有条款、只有本引擎模型的
    那几个。上下是这个特性自己的历史：格子里每一块是一件事——紫块是一篇 mentor 文稿，块上是
    编号、类型、作者单位的标志，再加一行「它做了什么」（条号、处理了多少条意见、文中「接受／修订／
    否决」各出现多少次——那是字样计数，不是对裁决的解读）与它的标题；蓝块是已发布条款，绿块是本
    仓库写下那门课的那一天。一格有几件事就摆几块，不省略。<b>点一列，它就地展开</b>：行里的点变成逐条的文稿，表头变成它的全部特性行、
    依赖与文稿上的单位。这一页与仿真器里的 🗺 图谱是同一份数据、同一条骨架
    （<code>src/course/featureGraph.ts</code>），两份覆盖表与两份生成的日期表现算而来，不存第二份数据。</p>
  <div class="legend">
    ${(Object.keys(FAMILY_NAME) as FeatureGroup['family'][]).map((f) =>
      `<span><span class="sw" style="background:var(--${f})"></span>${FAMILY_NAME[f]}</span>`).join('')}
    <span><span class="sw" style="background:var(--full)"></span>已建模</span>
    <span><span class="sw" style="background:var(--part)"></span>部分建模</span>
    <span><span class="sw" style="background:var(--none)"></span>未建模</span>
    <span><span class="sw" style="background:var(--contested);border-radius:50%"></span>仍在争论／无法判定</span>
    <span><span class="sw" style="background:var(--core);border-radius:50%"></span>已发布条款</span>
    <span><span class="sw" style="background:var(--draft);border-radius:50%"></span>mentor 文稿</span>
    <span><span class="sw" style="background:var(--full);border-radius:50%"></span>本仓库的课</span>
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
  const COL_W = 158, OPEN_W = 376, GUTTER = 84
  const deps = ${JSON.stringify(DEPS)}

  /** Widen one column in place, spell out its cells, and draw its dependency arcs. */
  function open(track, id) {
    const m = byId('m-' + track)
    const heads = [...m.querySelectorAll('.head')]
    const now = m.dataset.open === id ? null : id
    m.dataset.open = now ?? ''
    const index = heads.findIndex((h) => h.dataset.id === track + '-' + now)
    const widths = heads.map((_, i) => (i === index ? OPEN_W : COL_W))
    m.style.gridTemplateColumns = GUTTER + 'px ' + widths.map((w) => w + 'px').join(' ')
    for (const el of m.querySelectorAll('.head, .cell')) {
      const i = Number(el.dataset.col)
      el.classList.toggle('on', i === index)
      el.classList.remove('need')
    }
    const svg = byId('a-' + track)
    svg.innerHTML = svg.querySelector('defs').outerHTML
    svg.setAttribute('width', GUTTER + widths.reduce((a, b) => a + b, 0))
    if (index < 0) return
    const xOf = (i) => GUTTER + widths.slice(0, i).reduce((a, b) => a + b, 0) + COL_W / 2
    for (const need of (deps[track] || {})[now] || []) {
      const from = heads.findIndex((h) => h.dataset.id === track + '-' + need.id)
      if (from < 0) continue
      heads[from].classList.add('need')
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      p.setAttribute('d', 'M' + xOf(from) + ' 31 C' + xOf(from) + ' 4 ' + xOf(index) + ' 4 '
        + xOf(index) + ' 31')
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke', 'currentColor')
      p.setAttribute('stroke-width', '1.4')
      p.setAttribute('marker-end', 'url(#ar-' + track + ')')
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      t.textContent = need.title + ' → ' + need.why
      p.appendChild(t)
      svg.appendChild(p)
    }
  }

  const tracks = ${JSON.stringify(TRACKS)}
  for (const t of tracks) {
    const m = byId('m-' + t)
    for (const el of m.querySelectorAll('.head, .cell')) {
      el.addEventListener('click', (ev) => {
        if (ev.target.closest('.card')) return
        const i = Number(el.dataset.col)
        const head = m.querySelectorAll('.head')[i]
        open(t, head.dataset.id.slice(t.length + 1))
      })
    }
  }
  const show = (which) => {
    for (const t of tracks) {
      byId('t-' + t).setAttribute('aria-selected', String(t === which))
      byId('v-' + t).classList.toggle('on', t === which)
    }
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
