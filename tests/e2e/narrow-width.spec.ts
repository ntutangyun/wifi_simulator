/**
 * The narrow-width sweep: every mode, at every viewport, measured for things
 * that have fallen off the side of the screen.
 *
 * Four defects in this app were only ever visible at 470 CSS px, and all four
 * were found by a person walking into them. This is the instrument that was
 * missing. It asks four questions of a rendered page, and they are four
 * questions and not one because each of the four defects answered a different
 * one:
 *
 *  1. **Does the page scroll sideways?** The cheapest question, and the one that
 *     catches the most obvious kind of overflow.
 *  2. **Does any element hold content wider than itself?** `scrollWidth`
 *     against `clientWidth`, excusing an element that declares horizontal
 *     scrolling — because then the content is reachable. This is what caught the
 *     editor: `1fr 280px 300px` is 580 px of columns inside a 470 px `main`
 *     whose `overflow: hidden` clipped the rest away unreachably.
 *  3. **Is any box outside the viewport?** A box can be entirely off screen
 *     without anything overflowing anything, and that is exactly what the
 *     floating glossary window did: `position: fixed`, 620 px wide, its own
 *     content fitting perfectly inside itself, 162 px of it — including the ✕ —
 *     past the right edge of a 470 px screen.
 *  4. **Is every control in the top bar on screen?** Asked separately because
 *     question 2 would excuse it: the top bar's control group declares
 *     `overflow-x: auto`, so two of the three mode buttons scrolling out of
 *     sight behind a scrollbar that `.hscroll` hides is, to question 2, legal.
 *     It is not legal for the app's navigation, and the invariant is written
 *     here rather than inferred.
 *
 * An instrument that excuses too much is how a check ends up permitted and
 * inert, so here is every exclusion it makes, in full. Questions 2 and 3 skip
 * everything inside an `<svg>`: the floor plan's children live in the plan's own
 * coordinate system, `getBoundingClientRect` on an SVG text node reports the box
 * it would occupy untruncated, and `clientWidth` on one is meaningless — the
 * room labels measure `scrollWidth: 62` against `clientWidth: 2`. The picture
 * declares `overflow: hidden` on its host and clipping its edge labels is its
 * design. Question 2 excuses an element that declares a sideways scroll, and
 * question 3 excuses anything inside one, which is why question 4 exists at all.
 * Question 2 also excuses `text-overflow: ellipsis` — **and that one is an
 * exemption rather than a verdict: it walks past a real defect, the timeline's
 * hint row, which at 470 px shows a third of its sentence and puts the rest in a
 * `title` that a touchscreen cannot hover.** The clause sits at `truncates`
 * below with the symptom, the measurement and what narrowing it would take; it
 * is a debt this sweep is carrying, not a thing it has cleared.
 * Question 4 is scoped to the top bar and not to every control on the page,
 * because the player's transport row really is one row that scrolls sideways on
 * this device — a decision taken knowingly, with the gesture verified on the
 * hardware (`.superpowers/sdd/folded-layout/report.md`, section 5). Navigation
 * is not a thing to scroll for; a transport is. Nothing else is excused.
 */
import { expect, test, type Page } from '@playwright/test'

/** A lesson with a `watch` call-out that carries a jump — `src/course/tier1/airtime.ts`. */
const LESSON_WITH_JUMP = 'airtime'

/**
 * The 3-D scene's canvas, and not just any canvas in `main`: the timeline draws
 * into one of its own, so a bare `main canvas` matches two elements and the one
 * that must survive a jump is three.js's.
 */
const SCENE_CANVAS = 'main canvas[data-engine]'

/** Half a pixel of slack, for a layout that resolves to fractions. */
const EPS = 1.5

interface Offender {
  path: string
  text: string
  a: number
  b: number
}

interface Survey {
  pointerCoarse: boolean
  viewport: { w: number; h: number }
  pageScroll: { scrollWidth: number; clientWidth: number }
  /** Question 2: elements holding content wider than themselves. */
  overflowing: Offender[]
  /** Question 3: boxes that reach past the left or right edge of the viewport. */
  outside: Offender[]
  /** Question 4: the top bar's controls, each with its own right edge. */
  headerControls: { text: string; left: number; right: number; inside: boolean }[]
}

/**
 * Measure one rendered page. Everything happens in the browser in one pass,
 * because a round trip per element would make this slow enough to be skipped.
 */
async function survey(page: Page): Promise<Survey> {
  return page.evaluate(() => {
    const EPS_IN = 1.5
    const SVG_NS = 'http://www.w3.org/2000/svg'

    const path = (el: Element): string => {
      const parts: string[] = []
      for (let e: Element | null = el; e !== null && parts.length < 5; e = e.parentElement) {
        let s = e.tagName.toLowerCase()
        const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : ''
        if (cls) s += `.${cls}`
        parts.unshift(s)
      }
      return parts.join('>')
    }
    const label = (el: Element): string => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 48)

    /** Whether anything between `el` and the root can be scrolled sideways. */
    const inHorizontalScroller = (el: Element): boolean => {
      for (let e = el.parentElement; e !== null; e = e.parentElement) {
        const ox = getComputedStyle(e).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
      }
      return false
    }

    const overflowing: Offender[] = []
    const outside: Offender[] = []
    const vw = window.innerWidth

    for (const el of Array.from(document.querySelectorAll('*'))) {
      // Out of scope: the floor plan's own coordinate space. The reason is in
      // this file's header, under the list of every exclusion.
      if (el.namespaceURI === SVG_NS || el.closest('svg') !== null) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const scrollsX = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
      /*
       * `text-overflow: ellipsis` is a declared truncation: the element is
       * saying it means to cut its own text and to show that it did. It is not
       * inherited, so this excuses the element that asked for it and nothing
       * under it.
       *
       * ===== THIS IS AN EXEMPTION, NOT A VERDICT =====
       *
       * The case that found this clause is a defect, and this clause is the
       * reason the sweep walks past it. Writing it down so the next reader
       * inherits a debt rather than a conclusion:
       *
       * The timeline's hint row (`src/ui/TimelineStrip.tsx`, the absolutely
       * positioned `div` ending `{fmtNs(spanNs)} s · {L.strip.windowHint}`)
       * measures `scrollWidth 356` against `clientWidth 127` at 470 px. **Two
       * thirds of the sentence is not on the screen.** What is left is the time
       * reading and an ellipsis; the rest — "滚轮或拖动移时间 · Ctrl+滚轮或双指
       * 捏合缩放 · 点击帧看详情", i.e. every gesture the timeline has — is
       * reachable only through the element's `title`, **and a touchscreen has no
       * hover**. So on the one device this app is read on, the folded foldable,
       * that text does not exist. It is the same shape as the four defects this
       * file was written for: only at 470 px, and only discoverable by someone
       * walking into it.
       *
       * It is exempted because the truncation is deliberate and marked — the
       * element asked for the ellipsis, and a sweep that failed on every
       * `text-overflow: ellipsis` in the app would fail on the editor's node
       * list too, where cutting a long device name is exactly right. The
       * discriminating question is not "was it truncated" but "is what was cut
       * reachable without a pointer that hovers", and this sweep cannot measure
       * that. Whoever fixes the hint row should narrow this clause rather than
       * widen it: the honest rule is probably "an element may truncate its text
       * only if the full text is reachable without hover", which needs somewhere
       * for the full text to go first.
       */
      const truncates = cs.textOverflow === 'ellipsis'

      // Question 2. An element that declares a sideways scroll is excused:
      // what it hides is reachable by scrolling it.
      if (!scrollsX && !truncates && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + EPS_IN) {
        overflowing.push({ path: path(el), text: label(el), a: el.scrollWidth, b: el.clientWidth })
      }

      // Question 3. A box past the edge of the screen, where no ancestor can be
      // scrolled to bring it back.
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0 && !inHorizontalScroller(el)) {
        if (r.right > vw + EPS_IN || r.left < -EPS_IN) {
          outside.push({ path: path(el), text: label(el), a: Math.round(r.left), b: Math.round(r.right) })
        }
      }
    }

    const header = document.querySelector('header')
    const headerControls = Array.from(header?.querySelectorAll('button, select, input') ?? []).map((c) => {
      const r = c.getBoundingClientRect()
      return {
        text: (c.textContent ?? '').trim().slice(0, 24),
        left: Math.round(r.left),
        right: Math.round(r.right),
        inside: r.left >= -EPS_IN && r.right <= vw + EPS_IN,
      }
    })

    return {
      pointerCoarse: window.matchMedia('(pointer: coarse)').matches,
      viewport: { w: vw, h: window.innerHeight },
      pageScroll: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      overflowing,
      outside,
      headerControls,
    }
  })
}

/** The four questions, asserted together so one page yields one verdict. */
function expectNothingOffScreen(s: Survey, where: string): void {
  // 1.
  expect(s.pageScroll.scrollWidth, `${where}: the page scrolls sideways`)
    .toBeLessThanOrEqual(s.pageScroll.clientWidth + EPS)
  // 2.
  expect(s.overflowing, `${where}: content wider than its own box`).toEqual([])
  // 3.
  expect(s.outside, `${where}: a box past the edge of the screen`).toEqual([])
  // 4.
  expect(s.headerControls.filter((c) => !c.inside), `${where}: a top-bar control off screen`).toEqual([])
  // …and the top bar must have controls at all, or question 4 is vacuous.
  expect(s.headerControls.length, `${where}: no top-bar controls found`).toBeGreaterThan(2)
}

/** Open the app in a given mode, with a given lesson selected, from a clean slate. */
async function open(page: Page, mode: 'edit' | 'simulate' | 'course', lesson?: string): Promise<void> {
  await page.addInitScript(([m, l]: [string, string]) => {
    try {
      localStorage.clear()
      localStorage.setItem('wifi-sim.mode', m)
      if (l) localStorage.setItem('wifi-sim.lesson', l)
    } catch {
      // a browser with storage blocked gets the app's own defaults
    }
  }, [mode, lesson ?? ''] as [string, string])
  await page.goto('/')
  await page.locator('header button').first().waitFor()
}

test.describe('nothing falls off the side of the screen', () => {
  test('the viewport and the pointer type are the ones this project claims', async ({ page }, info) => {
    await open(page, 'edit')
    const s = await survey(page)
    const want = info.project.use.viewport
    expect(s.viewport.w).toBe(want?.width)
    expect(s.viewport.h).toBe(want?.height)
    // The instrument's own premise: `index.css` sizes controls by pointer type,
    // so a run that measured a mouse would be measuring a different device.
    expect(s.pointerCoarse).toBe(info.project.name !== 'desktop')
  })

  test('edit mode, each of the three panels', async ({ page }) => {
    await open(page, 'edit')
    expectNothingOffScreen(await survey(page), 'edit · as opened')

    // At one column the editor is three tabs; at wider widths there are none and
    // this loop runs once over nothing, which is the point — the arrangement
    // under test is whichever one this viewport gets.
    const tabs = page.locator('main button', { hasText: /平面图|对象 \/ 属性|📖 说明/ })
    for (let i = 0; i < (await tabs.count()); i++) {
      const name = (await tabs.nth(i).textContent()) ?? `tab ${i}`
      await tabs.nth(i).click()
      expectNothingOffScreen(await survey(page), `edit · ${name}`)
    }
  })

  test('edit mode, with a plan the schema refuses', async ({ page }) => {
    await open(page, 'edit')
    // Six refusal lines at once: this row is what the `100vw` patch was for, and
    // the lines are long enough that a row measured against the wrong box puts
    // every one of them off the screen.
    await page.evaluate(() => {
      localStorage.setItem('wifi-sim.scenario', JSON.stringify({
        seed: -1, rtsThresholdBytes: -5, rooms: 'x', walls: 3, nodes: 'y', servers: 1,
      }))
    })
    const plan = page.locator('main button', { hasText: '🏠 平面图' })
    if (await plan.count()) await plan.click()
    await page.locator('main button', { hasText: /^📂 载入$/ }).click()
    await expect(page.locator('main span', { hasText: 'Expected array' }).first()).toBeVisible()
    expectNothingOffScreen(await survey(page), 'edit · six refusal lines')
  })

  test('simulate mode, with a run on screen', async ({ page }) => {
    await open(page, 'simulate')
    await page.locator(SCENE_CANVAS).waitFor()
    expectNothingOffScreen(await survey(page), 'simulate · running')
  })

  test('course mode, the catalogue and a lesson', async ({ page }) => {
    await open(page, 'course')
    expectNothingOffScreen(await survey(page), 'course · catalogue')

    await open(page, 'course', LESSON_WITH_JUMP)
    await expect(page.locator('main button', { hasText: '▶ 载入并观察' }).first()).toBeVisible()
    expectNothingOffScreen(await survey(page), 'course · lesson, prose')

    await page.locator('main button', { hasText: '▶ 载入并观察' }).first().click()
    await page.locator(SCENE_CANVAS).waitFor()
    expectNothingOffScreen(await survey(page), 'course · lesson, loaded')
  })

  test('course mode, with the side drawer open', async ({ page }) => {
    await open(page, 'course', LESSON_WITH_JUMP)
    const drawer = page.locator('header button', { hasText: /^(🔍|🔍 检视器 \/ 日志)$/ })
    // At desktop width the inspector is a column and there is no drawer button.
    if (!(await drawer.count())) {
      expectNothingOffScreen(await survey(page), 'course · inspector as a column')
      return
    }
    await drawer.click()
    await expect(page.locator('header button', { hasText: '关闭' })).toBeVisible()
    expectNothingOffScreen(await survey(page), 'course · drawer open')
  })

  test('the floating glossary window, wherever it opens', async ({ page }) => {
    await open(page, 'course', LESSON_WITH_JUMP)
    await page.locator('header button', { hasText: /^(📖|📖 学习指南)$/ }).click()
    const win = page.locator('div[style*="z-index: 50"], div[style*="zIndex: 50"]').first()
    await expect(win).toBeVisible()
    expectNothingOffScreen(await survey(page), 'the glossary window')

    // And its ✕ has to be reachable, which is the thing that was actually lost:
    // at 470 px the window kept its 620 px and the close button sat at x 623.
    const close = win.locator('button[title]').last()
    await close.click()
    await expect(win).toBeHidden()
  })
})

/**
 * "⚡ 跳到那里" at one column, and the camera it must not touch.
 *
 * This is the behaviour half of the slice, and it belongs in a browser because
 * the thing that was wrong is which pane is on screen — `pane` is local state in
 * `App.tsx`, reachable from no store and no pure function.
 */
/**
 * Press "⚡ 跳到那里" until the moment it looks for is in the recording.
 *
 * It has to be this and not one click, and the reason is a lesson about this
 * very test: a jump into a moment the player has not simulated yet does nothing
 * but print "当前仿真窗口内尚未出现" into the prose — `seekFirst` returns false
 * and no signal is sent. The first version of the two-column case clicked once,
 * raced the worker, missed, and then **passed** under the implementation it was
 * written to reject, because an unsent signal rebuilds nothing either. It was
 * caught by reverting the fix and watching the test stay green.
 *
 * So the helper insists the jump landed, and the caller then has something to
 * assert about. The playhead moving off zero is the independent witness: the
 * recording starts there and nothing in this test plays it.
 */
async function jumpUntilFound(page: Page): Promise<void> {
  const button = page.locator('main button', { hasText: '⚡ 跳到那里' }).first()
  const missed = page.getByText('当前仿真窗口内尚未出现')
  for (let attempt = 0; attempt < 40; attempt++) {
    await button.click()
    if ((await missed.count()) === 0) {
      await expect(page.locator('span', { hasText: /^t = / }).first()).not.toHaveText(/t = 0\.000 000 000 s/)
      return
    }
    await page.waitForTimeout(250)
  }
  throw new Error('the jump never found its moment: the recording never reached it')
}

test.describe('a jump brings the view on screen without rebuilding it', () => {
  test('the jump puts the viewport up, and leaves the scene standing', async ({ page }, info) => {
    await open(page, 'course', LESSON_WITH_JUMP)
    await page.locator('main button', { hasText: '▶ 载入并观察' }).first().click()
    const canvas = page.locator(SCENE_CANVAS)
    await canvas.waitFor()

    const oneColumn = (info.project.use.viewport?.width ?? 0) < 700
    if (oneColumn) {
      // The load itself must have switched the pane — that much already worked.
      await expect(page.locator('header button', { hasText: '视图' })).toHaveClass(/active/)
      // Back to the prose, which is where the jump button is.
      await page.locator('header button', { hasText: '课文' }).click()
      await expect(canvas).toHaveCount(0)
      await jumpUntilFound(page)
      // The defect: the playhead moved and the reader was left on the prose.
      await expect(page.locator('header button', { hasText: '视图' })).toHaveClass(/active/)
      await expect(canvas).toHaveCount(1)
      expectNothingOffScreen(await survey(page), 'course · after a jump')
      return
    }

    // Two columns: the prose and the view are both up, so the scene is mounted
    // across the jump and its identity is measurable. This is the half that
    // tells this fix apart from the one that reuses `simSession`: that signal is
    // the `<Viewport>` key, so bumping it would replace this element and put the
    // camera back at its starting position.
    await page.evaluate((sel: string) => {
      const c = document.querySelector(sel) as (HTMLCanvasElement & { __probe?: string }) | null
      if (c) c.__probe = 'before the jump'
    }, SCENE_CANVAS)
    await jumpUntilFound(page)
    await expect(canvas).toHaveCount(1)
    const probe = await page.evaluate((sel: string) => {
      const c = document.querySelector(sel) as (HTMLCanvasElement & { __probe?: string }) | null
      return c?.__probe ?? null
    }, SCENE_CANVAS)
    expect(probe, 'the 3-D view was rebuilt by the jump').toBe('before the jump')
  })
})
