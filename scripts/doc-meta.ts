/**
 * Regenerate `src/course/docMeta.json`: one line per IEEE mentor document that either coverage
 * table cites, carrying the three things the feature map needs and nothing else — **when it was
 * first disclosed, what kind of document it is, and which companies' names are on it**.
 *
 * Why a generated file rather than a lookup at build time: the catalogues live outside this
 * repository (they are part of the patent project's mentor mirror, hundreds of megabytes of
 * third-party documents, and this repository must never carry standards text). The feature map
 * needs dates in the browser, so the dates are committed and the command that produced them is
 * committed beside them.
 *
 *   npx vite-node scripts/doc-meta.ts            # refresh from the mirror on this machine
 *   npx vite-node scripts/doc-meta.ts --check    # fail if the file is not what the mirror says
 *
 * **What it does NOT claim.** The companies here are the author affiliations printed on the
 * documents a row cites — they are who wrote that contribution or that comment resolution, which
 * is a usable proxy for「who took part in this feature」 and nothing stronger. Procedural
 * documents (agendas, minutes, closing reports) are kept for their dates but contribute no
 * company, because their author is the task group's own chair or secretary, not a participant in
 * the feature. That rule lives in `featureGraph.ts` (it reads `kind`), not here.
 *
 * On a machine without the mirror the script refuses to write rather than emptying the file, and
 * says which path it looked for.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Where the mentor mirrors live on this machine. Overridable, because they are not portable. */
const CORPORA: { name: string; env: string; path: string }[] = [
  {
    name: 'uwb_tg4ab',
    env: 'UWB_TG4AB_CATALOG',
    path: 'D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/uwb_tg4ab/catalog.json',
  },
  {
    name: 'amp_tgbp',
    env: 'AMP_TGBP_CATALOG',
    path: 'D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/amp_tgbp/catalog.json',
  },
  {
    name: 'wifi8_tgbn',
    env: 'WIFI8_TGBN_CATALOG',
    path: 'D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/wifi8_tgbn/catalog.json',
  },
]

const DOCS = ['docs/uwb-feature-coverage.md', 'docs/wifi-feature-coverage.md']
const OUT = 'src/course/docMeta.json'

/**
 * One company, one name. The affiliation field is typed by hand into a web form once per
 * document, so the same company arrives spelled several ways — and a chip per spelling would
 * claim more participants than there are. Everything on the left was seen in the two catalogues;
 * anything not listed is kept verbatim (and `doc-meta.test.ts` fails on the shapes that mean a
 * missed alias, so a new spelling is a test failure rather than a second chip).
 */
const ALIAS: Record<string, string> = {
  'Apple Inc': 'Apple', 'Apple Inc.': 'Apple',
  'BCA': 'Blind Creek Associates', 'BCA et al': 'Blind Creek Associates',
  'Calterah Semiconductor': 'Calterah', 'Calterah Semico': 'Calterah',
  'Cisco Systems': 'Cisco',
  'HaiLa Technologies': 'HaiLa',
  'Huawei Technologies': 'Huawei',
  'Infineon Technologies': 'Infineon',
  'LG Electronics': 'LG', 'LG Electronincs': 'LG',
  'MediaTek Inc.': 'MediaTek',
  'NXP Semiconductors': 'NXP',
  'Qualcomm Technologies Inc.': 'Qualcomm', 'Qualcomm Technologies, Inc.': 'Qualcomm',
  'Samsung Electronics': 'Samsung', 'Samsung Electro': 'Samsung',
  'Spark Microsystems': 'Spark',
  'ST': 'STMicroelectronics',
  'Sony Group Corporation': 'Sony',
  'self, Imagicon': 'Imagicon', 'self': 'Imagicon',
}

interface CatalogDoc {
  dcn: string
  date: string
  first_disclosed?: string
  author?: string
  title: string
  kind: string
}

const dcnKey = (dcn: string): string => dcn.split('r')[0]!

/**
 * **Minutes are not contributions, whatever the catalogue calls them.**
 *
 * The mirror's `kind` comes from title rules that catch agendas and closing reports but not
 * 「TG4ab July Plenary Mins」, so eight sets of TG4ab minutes arrive as `proposal` — and their
 * author is the member who keeps the minutes for the group. Left alone, that one secretary's
 * company came out as a contributor to almost every feature in the draft, which is how the first
 * version of the company chips read. The title says what they are, so the title decides.
 */
const MINUTES = /mins|minutes|conf call|meeting slides/i
const kindOf = (d: CatalogDoc): string => (MINUTES.test(d.title) ? 'minutes' : d.kind)

function orgsOf(author: string): string[] {
  const out: string[] = []
  for (const m of author.matchAll(/\(([^)]+)\)/g)) {
    const raw = m[1]!.trim()
    const name = ALIAS[raw] ?? raw
    if (!out.includes(name)) out.push(name)
  }
  return out
}

const check = process.argv.includes('--check')
const found: { name: string; catalog: string; generated: string; docs: number }[] = []
const byDcn = new Map<string, CatalogDoc>()

for (const c of CORPORA) {
  const path = process.env[c.env] ?? c.path
  if (!existsSync(path)) {
    console.error(`  ${c.name}: no catalogue at ${path} (set $${c.env})`)
    continue
  }
  const cat = JSON.parse(readFileSync(path, 'utf8')) as
    { generated: string; documents: CatalogDoc[] }
  for (const d of cat.documents) if (!byDcn.has(dcnKey(d.dcn))) byDcn.set(dcnKey(d.dcn), d)
  found.push({ name: c.name, catalog: path, generated: cat.generated, docs: cat.documents.length })
  console.log(`  ${c.name}: ${cat.documents.length} documents, catalogue of ${cat.generated}`)
}
if (found.length === 0) {
  console.error('no mentor mirror on this machine — refusing to write an empty docMeta.json')
  process.exit(2)
}

const cited = new Set<string>()
for (const d of DOCS) {
  const text = readFileSync(resolve(d), 'utf8')
  for (const m of text.matchAll(/\b(1[15]-\d\d\/\d{4})(?:r\d+)?/g)) cited.add(m[1]!)
}

const docs: Record<string, { date: string; kind: string; title: string; orgs: string[] }> = {}
const missing: string[] = []
for (const dcn of [...cited].sort()) {
  const d = byDcn.get(dcn)
  if (d === undefined) { missing.push(dcn); continue }
  docs[dcn] = {
    date: d.first_disclosed ?? d.date,
    kind: kindOf(d),
    title: d.title,
    orgs: orgsOf(d.author ?? ''),
  }
}

const out = {
  comment: 'Generated by scripts/doc-meta.ts from the mentor mirrors named below. Do not edit by'
    + ' hand: the dates are evidence, and the command that produced them is in the header of that'
    + ' script. `orgs` are author affiliations as printed on the document, one name per company.',
  generated: new Date().toISOString().slice(0, 10),
  corpora: found,
  cited: cited.size,
  missing,
  docs,
}
const text = `${JSON.stringify(out, null, 1)}\n`

if (check) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  const strip = (s: string): string => s.replace(/"generated": "[^"]+",/g, '')
  if (strip(have) !== strip(text)) {
    console.error(`${OUT} is not what the mirror says — run: npx vite-node scripts/doc-meta.ts`)
    process.exit(1)
  }
  console.log(`${OUT}: up to date (${cited.size} cited, ${missing.length} missing)`)
} else {
  writeFileSync(OUT, text)
  console.log(`→ ${OUT}: ${Object.keys(docs).length} of ${cited.size} cited documents`
    + `${missing.length > 0 ? `, missing ${missing.join(', ')}` : ''}`)
}
