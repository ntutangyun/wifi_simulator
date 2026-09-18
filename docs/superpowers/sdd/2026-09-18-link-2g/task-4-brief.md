### Task 4: `LinkId '2g'` in the capability model and the scenario schema

**Files:**
- Modify: `src/model/caps.ts` (`LinkId` line 9; `widthOf` 18-22; `nodeLinks` 94-99; `virtualId`/`physicalId`/`linkOfVirtual` 101-113; `linkPlanFor` 123-140)
- Modify: `src/model/scenario.ts` (`NodeCfg.linkId` line 108; schema line 237)
- Test: `tests/model/caps.test.ts`, `tests/model/scenario.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type LinkId = '2g' | '5g' | '6g'
  export const LINK_ORDER: LinkId[]                       // ['5g', '6g', '2g']: lane order, 5/6 first so old scenarios keep theirs
  export const BAND_LABEL: Record<LinkId, string>         // { '2g': '2.4G', '5g': '5G', '6g': '6G' }
  export function linkOfVirtual(vid: string): LinkId
  export function virtualId(nodeId: string, link: LinkId): string   // 'id', 'id#6g', 'id#2g'
  export function widthOf(n: NodeCfg, link?: LinkId): ChannelWidth  // clamps to 40 on '2g'
  export function negotiatedWidth(a: NodeCfg, b: NodeCfg, link?: LinkId): ChannelWidth
  export function nodeLinks(n: NodeCfg, apMlo: boolean): LinkId[]   // stations: their link(s); AP: 5g (+6g if MLO)
  export function linkPlanFor(nodes: NodeCfg[]): LinkPlan            // AP joins every link a station uses
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/model/caps.test.ts`:

```ts
import { BAND_LABEL, LINK_ORDER, linkOfVirtual, linkPlanFor, nodeLinks, virtualId, widthOf } from '../../src/model/caps'
import type { NodeCfg } from '../../src/model/scenario'

const mk = (id: string, kind: 'ap' | 'sta', generation: 'nonht' | 'vht' | 'he' | 'eht', extra: Partial<NodeCfg> = {}): NodeCfg => ({
  id, kind, name: id, pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15, profiles: ['idle'],
  caps: { generation, features: {} }, ...extra,
})

describe('the 2.4 GHz link', () => {
  it('virtual ids and band labels', () => {
    expect(virtualId('sta-1', '2g')).toBe('sta-1#2g')
    expect(virtualId('sta-1', '5g')).toBe('sta-1')
    expect(linkOfVirtual('sta-1#2g')).toBe('2g')
    expect(linkOfVirtual('sta-1#6g')).toBe('6g')
    expect(linkOfVirtual('sta-1')).toBe('5g')
    expect(BAND_LABEL).toEqual({ '2g': '2.4G', '5g': '5G', '6g': '6G' })
    expect(LINK_ORDER).toEqual(['5g', '6g', '2g'])
  })

  it('a station with linkId 2g is on the 2.4 GHz link unless it is VHT', () => {
    expect(nodeLinks(mk('s', 'sta', 'nonht', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'he', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'eht', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'vht', { linkId: '2g' }), false)).toEqual(['5g'])
    expect(nodeLinks(mk('s', 'sta', 'he', { linkId: '6g' }), false)).toEqual(['6g'])
    expect(nodeLinks(mk('s', 'sta', 'he'), false)).toEqual(['5g'])
  })

  it('the AP joins every link a station uses; 5 GHz-only scenarios are unchanged', () => {
    const ap = mk('ap', 'ap', 'eht')
    const old = linkPlanFor([ap, mk('a', 'sta', 'he'), mk('b', 'sta', 'nonht')])
    expect(old.links).toEqual(['5g'])
    expect(old.virtualIds).toEqual(['ap', 'a', 'b'])
    const mixed = linkPlanFor([ap, mk('a', 'sta', 'he', { linkId: '2g' }), mk('b', 'sta', 'nonht')])
    expect(mixed.links).toEqual(['5g', '2g'])
    expect(mixed.members['2g']).toEqual(['ap', 'a'])
    expect(mixed.members['5g']).toEqual(['ap', 'b'])
    expect(mixed.virtualIds).toEqual(['ap', 'ap#2g', 'a#2g', 'b'])
  })

  it('width is clamped to 40 MHz on 2.4 GHz', () => {
    const n = mk('s', 'sta', 'eht', { caps: { generation: 'eht', features: {}, widthMhz: 160 }, linkId: '2g' })
    expect(widthOf(n)).toBe(160)
    expect(widthOf(n, '2g')).toBe(40)
  })
})
```

Append to `tests/model/scenario.test.ts`:

```ts
import { ScenarioSchema, defaultScenario } from '../../src/model/scenario'

describe('linkId 2g in the schema', () => {
  it('accepts 2g on non-VHT stations and rejects it on VHT', () => {
    const sc = defaultScenario()
    sc.nodes[1].linkId = '2g'
    sc.nodes[1].caps.generation = 'he'
    expect(() => ScenarioSchema.parse(sc)).not.toThrow()
    sc.nodes[1].caps.generation = 'vht'
    expect(() => ScenarioSchema.parse(sc)).toThrow(/2\.4 GHz/)
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/model/caps.test.ts tests/model/scenario.test.ts`
Expected: FAIL (`LINK_ORDER` missing; `'2g'` rejected).

- [ ] **Step 3: Implement in caps.ts**

```ts
export type LinkId = '2g' | '5g' | '6g'
/** Lane order: 5 and 6 GHz first so scenarios that predate the 2.4 GHz link keep their lanes. */
export const LINK_ORDER: LinkId[] = ['5g', '6g', '2g']
export const BAND_LABEL: Record<LinkId, string> = { '2g': '2.4G', '5g': '5G', '6g': '6G' }

/** Widest channel each generation can operate; 2.4 GHz caps everything at 40 MHz. */
export function widthOf(n: NodeCfg, link?: LinkId): ChannelWidth {
  const want = n.caps.widthMhz ?? 20
  const max = Math.min(MAX_WIDTH[n.caps.generation], link === '2g' ? 40 : 320)
  return (want > max ? max : want) as ChannelWidth
}

export function negotiatedWidth(a: NodeCfg, b: NodeCfg, link?: LinkId): ChannelWidth {
  return Math.min(widthOf(a, link), widthOf(b, link)) as ChannelWidth
}

/** Links a node operates on. The AP's links are decided by linkPlanFor (every link a station uses). */
export function nodeLinks(n: NodeCfg, apMlo: boolean): LinkId[] {
  if (hasFeature(n, 'mlo') && (n.kind === 'ap' || apMlo)) return ['5g', '6g']
  const g = n.caps.generation
  if (n.kind !== 'ap' && n.linkId === '2g' && g !== 'vht') return ['2g']
  if ((g === 'he' || g === 'eht') && n.linkId === '6g') return ['6g']
  return ['5g']
}

export function virtualId(nodeId: string, link: LinkId): string {
  return link === '5g' ? nodeId : `${nodeId}#${link}`
}

export function linkOfVirtual(vid: string): LinkId {
  const i = vid.indexOf('#')
  return i < 0 ? '5g' : (vid.slice(i + 1) as LinkId)
}

export function linkPlanFor(nodes: NodeCfg[]): LinkPlan {
  const ap = nodes.find((n) => n.kind === 'ap')
  const apMlo = ap ? hasFeature(ap, 'mlo') : false
  const staLinks = new Map<string, LinkId[]>()
  const used = new Set<LinkId>(['5g'])
  if (apMlo) used.add('6g')
  for (const n of nodes) {
    if (n.kind === 'ap') continue
    const ls = nodeLinks(n, apMlo)
    staLinks.set(n.id, ls)
    for (const l of ls) used.add(l)
  }
  const apLinks = LINK_ORDER.filter((l) => used.has(l))
  const members: Record<LinkId, string[]> = { '2g': [], '5g': [], '6g': [] }
  const virtualIds: string[] = []
  for (const n of nodes) {
    for (const l of n.kind === 'ap' ? apLinks : staLinks.get(n.id)!) {
      members[l].push(n.id)
      virtualIds.push(virtualId(n.id, l))
    }
  }
  const links = LINK_ORDER.filter((l) => members[l].length > 0)
  return { links, members, virtualIds }
}
```

Keep `physicalId` as is. Run `grep -rn "nodeLinks(\|linkOfVirtual(\|virtualId(" src tests` and make sure every caller still type-checks (the `LinkPlan.members` record now has three keys; `src/model/view.ts` `siblingId` only pairs 5g/6g and needs no change).

- [ ] **Step 4: Implement in scenario.ts**

`NodeCfg.linkId?: LinkId` (import the type from `./caps`; the comment becomes "Operating link for non-MLO devices: '2g' (802.11g / Wi-Fi 6/7 on 2.4 GHz), '5g' default, '6g' (Wi-Fi 6E/7)."). Schema: `linkId: z.enum(['2g', '5g', '6g']).optional()`, and wrap the node object with `.superRefine((n, ctx) => { if (n.linkId === '2g' && n.caps.generation === 'vht') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Wi-Fi 5 (VHT) has no 2.4 GHz mode; pick 802.11g, Wi-Fi 6 or Wi-Fi 7 for the 2.4 GHz link' }) })` inside the `z.preprocess` (the refine must sit on the object schema, before the preprocess wrapper's return).

- [ ] **Step 5: Run the model tests and the type check**

Run: `npx vitest run tests/model && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/model/caps.ts src/model/scenario.ts tests/model/caps.test.ts tests/model/scenario.test.ts
git commit -m "feat(model): 2.4 GHz link id, band labels, AP on every link a station uses"
```

---

