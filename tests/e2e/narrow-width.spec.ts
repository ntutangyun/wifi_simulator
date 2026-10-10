/**
 * The narrow-width sweep: every mode, at every viewport, measured for things
 * that have fallen off the side of the screen.
 *
 * Since 2026-10-09 it carries one block that is not about width: the last one,
 * on whether the row a jump landed on is inside the event log's own scroll box.
 * It is here because the reason this file exists covers it exactly — a real
 * browser is the only thing that knows where a box ended up, and `vitest` runs
 * with no layout at all. The four questions below are unchanged.
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
 * The longest lesson id in the course, which is the worst case for the stable handle the
 * lesson header prints beside the title. 22 characters, so `@` plus the id is 23 — and
 * `tests/ui/lessonHandle.test.ts` is what keeps it the longest, with the bound stated as a
 * ceiling so this constant does not silently stop being the worst case.
 */
const LESSON_LONGEST_ID = 'uwb-sensing-resolution'

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

  /**
   * The viewport half of the reader's stable handle on a lesson.
   *
   * `tests/ui/lessonHandle.test.ts` pins that the panel prints `@<id>` beside the title,
   * that every id is ASCII and that none is longer than 22 characters. None of that is a
   * measurement of the screen: a unit test in `environment: 'node'` cannot tell whether
   * the handle is readable, and the one thing the 470 px column has repeatedly done to new
   * text is push it off the side — the real bound at 470 px is total content width, not a
   * column count, and a five-column table measured 525 px against 445 doing exactly this.
   *
   * So this asks of the worst case, at every viewport, the two questions that matter for a
   * string a reader is meant to COPY: is the whole box on the screen, and is the whole of
   * its text inside its own box. The second is the one `expectNothingOffScreen` would miss
   * on its own if an ancestor ever declared a sideways scroll — the handle is useless
   * half-read, so it is asked about this element directly rather than inherited from the
   * page sweep.
   */
  test('course mode, the stable lesson handle, at its longest', async ({ page }) => {
    await open(page, 'course', LESSON_LONGEST_ID)
    const handle = page.locator('main code', { hasText: `@${LESSON_LONGEST_ID}` }).first()
    await expect(handle).toBeVisible()

    const m = await handle.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const row = el.parentElement as HTMLElement
      return {
        text: (el.textContent ?? '').trim(),
        left: r.left, right: r.right, width: r.width,
        // The LINE, not the `<code>`: see below for why the obvious element is the wrong one.
        rowScrollWidth: row.scrollWidth, rowClientWidth: row.clientWidth, rowHeight: row.getBoundingClientRect().height,
        vw: window.innerWidth,
      }
    })

    // The whole id, not a prefix of it: a handle the reader retypes from the screen is
    // wrong if one character is missing, and that is not something `toBeVisible` asks.
    expect(m.text, 'the handle prints the whole id').toBe(`@${LESSON_LONGEST_ID}`)
    expect(m.width, 'the handle has a box at all').toBeGreaterThan(0)
    expect(m.left, `handle left edge at ${m.vw} px`).toBeGreaterThanOrEqual(-EPS)
    expect(m.right, `handle right edge at ${m.vw} px, viewport ${m.vw}`).toBeLessThanOrEqual(m.vw + EPS)

    /*
     * ===== the overflow question is asked of the LINE, and the reason is a ruler that lied =====
     *
     * The obvious form of this assertion is `code.scrollWidth <= code.clientWidth`. It is
     * worthless: `<code>` is an inline box, and an inline box reports `scrollWidth 0` and
     * `clientWidth 0` whatever it contains — measured here, at both viewports, on the
     * longest id in the course. So the obvious assertion reads `0 <= 0` and passes for a
     * handle that has been cut in half. This file's own page sweep already carries the same
     * warning about SVG text (`scrollWidth 62` against `clientWidth 2`); the lesson is the
     * repository's, and it got one more instance.
     *
     * The containing `div` is a block, so its numbers mean something: measured 445/445 at
     * 470 px and 523/523 at 939 px, one line of 15.2 px at both.
     */
    expect(m.rowClientWidth, 'the line is a block box, or this question is vacuous').toBeGreaterThan(0)
    expect(m.rowScrollWidth, `handle line: ${m.rowScrollWidth} px of content in a ${m.rowClientWidth} px box`)
      .toBeLessThanOrEqual(m.rowClientWidth + EPS)

    // …and the page as a whole still answers the four questions with this line on it.
    expectNothingOffScreen(await survey(page), 'course · lesson with the handle')
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
/** The clock in the transport row — the independent witness that a seek happened. */
const CLOCK = 'span:text-matches("^t = ")'

/** The sentence a jump prints when the moment it wants never happens at all. */
const JUMP_FAILED = '往后 3 秒的仿真里没有出现这一刻'

/**
 * Press "⚡ 跳到那里" **once**, and insist the jump landed.
 *
 * One click is the claim. It used to be a loop of up to forty, 250 ms apart,
 * and the reason was a lesson about this very test: a jump into a moment the
 * player had not simulated yet did nothing but print 「尚未出现」 into the prose
 * — `seekFirst` returned null and no signal was sent. The first version of the
 * two-column case clicked once, raced the worker, missed, and then **passed**
 * under the implementation it was written to reject, because an unsent signal
 * rebuilds nothing either. It was caught by reverting the fix and watching the
 * test stay green.
 *
 * The loop is gone because the race is: `Player.seekFirstAhead` holds the jump
 * and asks the worker to record further, so one click either lands at once or
 * lands when the recording reaches the moment. The loop would now hide the
 * difference — it would pass against a player that still needed to be asked
 * forty times.
 *
 * The playhead moving off zero is the witness: the recording starts there and
 * nothing in this test plays it.
 */
async function jumpUntilFound(page: Page): Promise<void> {
  await page.locator('main button', { hasText: '⚡ 跳到那里' }).first().click()
  await expect(page.getByText(JUMP_FAILED), 'the jump reported the moment never happens').toHaveCount(0)
  await expect(page.locator(CLOCK).first()).not.toHaveText(/t = 0\.000 000 000 s/)
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

/**
 * **The row the reader clicked, on the screen.**
 *
 * This is the half of the event-log fix that cannot be checked anywhere else.
 * `tests/ui/eventLogWindow.test.ts` proves the row is among the 160 the log
 * draws, for all 293 jumps of all 88 lessons, and that is a real claim — but a
 * batch of 160 rows is some 2 000 px tall inside a panel 511 px high, and the
 * log manages its own `scrollTop`. "In the DOM" and "in front of the reader"
 * are two different facts and only a browser holds the second one.
 *
 * `edca` 「接入点上的内部碰撞」 is the jump chosen because it is one of the three
 * the old `.slice(-160)` cut: its window holds 478 records and 178 of them come
 * after the target, so the newest 160 were all records that had not happened
 * yet. On the reader's screen the clock read `t = 0.362 642 600 s` and the
 * inspector showed the AP's TXOP, and the one line the lesson had just told them
 * to go and read was not rendered at all.
 */
const LESSON_DENSE_JUMP = 'edca'
const DENSE_JUMP_LABEL = '接入点上的内部碰撞'
/** What `src/ui/format.ts` renders that record as — the text the reader came for. */
const DENSE_JUMP_ROW = 'ap internal collision: AC_VO beats AC_BE'

test.describe('a jump puts its own row in front of the reader', () => {
  test(`${LESSON_DENSE_JUMP} · ${DENSE_JUMP_LABEL}`, async ({ page }, info) => {
    await open(page, 'course', LESSON_DENSE_JUMP)
    await page.locator('main button', { hasText: '▶ 载入并观察' }).first().click()
    await page.locator(SCENE_CANVAS).waitFor()

    // At one column, loading puts the 3-D view up and the prose — with the jump
    // buttons on it — is no longer mounted. The reader taps back to it, and so
    // does this: the sibling test above does the same, and without it this case
    // sat for 30 s waiting to click a button that was not on the page.
    if ((info.project.use.viewport?.width ?? 0) < 700) {
      await page.locator('header button', { hasText: '课文' }).click()
    }

    // One click, same as `jumpUntilFound`: the player holds a jump whose moment
    // is not recorded yet and lands it when the worker catches up, so a retry
    // loop here would pass against a player that could not.
    await page.locator('main button', { hasText: DENSE_JUMP_LABEL }).first().click()
    await expect(page.getByText(JUMP_FAILED)).toHaveCount(0)
    // The playhead is the independent witness that the seek happened, and this
    // jump's instant is a known constant of the recording.
    await expect(page.locator(CLOCK).first()).toHaveText('t = 0.362 642 600 s')

    // Now go and look at the log, the way a reader would: the drawer if this
    // viewport has one, then the log's own tab.
    const drawer = page.locator('header button', { hasText: /^(🔍|🔍 检视器 \/ 日志)$/ })
    if (await drawer.count()) await drawer.click()
    await page.locator('[role="tab"]', { hasText: '事件日志' }).click()

    const anchor = page.locator('[data-log-anchor]')
    await expect(anchor, 'the log drew no anchored row').toHaveCount(1)
    await expect(anchor).toContainText(DENSE_JUMP_ROW)

    // And it is inside its own scroll box rather than a screenful below the
    // fold. Measured against the nearest scrolling ancestor, which is the log.
    const geom = await page.evaluate(() => {
      const row = document.querySelector('[data-log-anchor]') as HTMLElement | null
      if (!row) return null
      let box: HTMLElement | null = row.parentElement
      while (box) {
        const o = getComputedStyle(box).overflowY
        if (o === 'auto' || o === 'scroll') break
        box = box.parentElement
      }
      if (!box) return null
      const r = row.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      return {
        rowTop: r.top, rowBottom: r.bottom, rowHeight: r.height,
        boxTop: b.top, boxBottom: b.bottom,
        viewportH: window.innerHeight, scrollTop: box.scrollTop, scrollHeight: box.scrollHeight,
      }
    })
    expect(geom, 'no scrolling ancestor found for the log row').not.toBeNull()
    const g = geom!
    // A row with no height is in the DOM and invisible, which is the exact
    // confusion this test exists to refuse.
    expect(g.rowHeight, 'the anchored row has no height').toBeGreaterThan(0)
    expect(g.rowTop, 'the anchored row is above the top of the log').toBeGreaterThanOrEqual(g.boxTop - EPS)
    expect(g.rowBottom, 'the anchored row is below the bottom of the log').toBeLessThanOrEqual(g.boxBottom + EPS)
    // …and the log itself is on the screen, so "inside the log" means something.
    expect(g.rowTop).toBeGreaterThanOrEqual(-EPS)
    expect(g.rowBottom).toBeLessThanOrEqual(g.viewportH + EPS)
    // The log really did have to scroll to manage it: if the batch fitted, this
    // test would be passing for a reason that has nothing to do with the fix.
    expect(g.scrollHeight, 'the log did not overflow, so nothing was proved about scrolling')
      .toBeGreaterThan(g.boxBottom - g.boxTop)

    expectNothingOffScreen(await survey(page), 'course · the log after a jump')
  })
})

/**
 * **The playhead's own row, on the screen, after the reader moved the playhead.**
 *
 * The block above covers a jump. This one covers the other half of the same
 * defect, and it was found by measuring rather than by reasoning: with the
 * batch now centred on the marker, the marker sits about eighty rows down a
 * 160-row batch, and nothing had ever told the box to scroll there. Measured in
 * this browser at all three viewports before the fix — the first frame after a
 * lesson loads, 事件 → ×1 and ×21, 帧交换 ⏭ ×10, and a 30-notch wheel seek on
 * the strip, across `edca`, `mumimo`, `radio-primer` and `airtime` — **54 of 60
 * measurements had the marker outside the box**, off by up to 2 206 px, with
 * `scrollTop` 0 in every one of the sixty.
 *
 * What is NOT claimed, and is deliberately not implemented: following the
 * playhead during playback. `EventLog` scrolls for the marker only while
 * `playing` is false, so this block never presses ▶. The three moves it does
 * make are the reader's own explicit ones.
 *
 * `mumimo` because it is dense at every one of those moves: its window holds
 * the full 160-row budget throughout, so the box always overflows and "the row
 * is in view" is always a claim about scrolling rather than about a short list
 * that happened to fit. The test asserts that overflow each time, for exactly
 * that reason.
 *
 * At 470 and 939 the log is a drawer whose scrim covers the transport, so the
 * reader cannot move the playhead and watch the log at the same time: the test
 * closes the drawer to move and reopens it to look, which remounts the panel at
 * `scrollTop` 0. At 1440 the log is a column and nothing remounts, so there the
 * old offset is still on the box when the playhead moves — the two cases fail
 * for different reasons and both are covered by running this in all three
 * projects.
 */
const LESSON_DENSE_LOG = 'mumimo'

/** The side panel's drawer button, at the viewports that have one. */
const sideButton = (page: Page) => page.locator('header button', { hasText: /^(🔍|🔍 检视器 \/ 日志)$/ })

/** Put the event log on screen. Returns whether it is a drawer at this size. */
async function openLog(page: Page): Promise<boolean> {
  const b = sideButton(page)
  const isDrawer = (await b.count()) > 0
  if (isDrawer) await b.click()
  await page.locator('[role="tab"]', { hasText: '事件日志' }).click()
  return isDrawer
}

/** …and out of the way again, so the transport underneath can be reached. */
async function closeLog(page: Page, isDrawer: boolean): Promise<void> {
  if (isDrawer) await page.locator('header button', { hasText: '关闭' }).first().click()
}

/** Where the marker row ended up, measured against its own scrolling ancestor. */
async function markerGeometry(page: Page) {
  return page.evaluate(() => {
    const row = document.querySelector('[data-log-marker]') as HTMLElement | null
    if (!row) return null
    let box: HTMLElement | null = row.parentElement
    while (box) {
      const o = getComputedStyle(box).overflowY
      if (o === 'auto' || o === 'scroll') break
      box = box.parentElement
    }
    if (!box) return null
    const r = row.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    return {
      rowHeight: r.height, rowTop: r.top, rowBottom: r.bottom,
      boxTop: b.top, boxBottom: b.bottom,
      viewportH: window.innerHeight, scrollTop: box.scrollTop, scrollHeight: box.scrollHeight,
    }
  })
}

async function expectMarkerInView(page: Page, what: string): Promise<void> {
  // The log can legitimately hold no marker: the window is
  // `[playhead − 3 ms, playhead + 0.5 ms]` and the first batch has not
  // necessarily arrived, so right after a load there is a moment with nothing
  // at or before the playhead to mark. Wait for the row rather than sleeping —
  // a fixed sleep here is what hid the missing `firstSeq` dependency in
  // `EventLog` at two of the three viewports.
  await page.locator('[data-log-marker]').first().waitFor({ timeout: 20_000 })
  const g = await markerGeometry(page)
  expect(g, `${what}: no marker row, or no scrolling ancestor for it`).not.toBeNull()
  const m = g!
  expect(m.rowHeight, `${what}: the marker row has no height`).toBeGreaterThan(0)
  expect(m.rowTop, `${what}: the marker is above the top of the log`).toBeGreaterThanOrEqual(m.boxTop - EPS)
  expect(m.rowBottom, `${what}: the marker is below the bottom of the log`).toBeLessThanOrEqual(m.boxBottom + EPS)
  // …and the log itself is on the screen, so "inside the log" means something.
  expect(m.rowTop, `${what}: off the top of the window`).toBeGreaterThanOrEqual(-EPS)
  expect(m.rowBottom, `${what}: off the bottom of the window`).toBeLessThanOrEqual(m.viewportH + EPS)
  // The box really did have to scroll. Without this the test could pass on a
  // batch short enough to fit, which proves nothing about the fix.
  expect(m.scrollHeight, `${what}: the log did not overflow, so nothing was proved`)
    .toBeGreaterThan(m.boxBottom - m.boxTop)
}

test.describe('the reader can see where the playhead is after moving it', () => {
  test(`${LESSON_DENSE_LOG} · load, step, seek`, async ({ page }) => {
    await open(page, 'course', LESSON_DENSE_LOG)
    await page.locator('main button', { hasText: '▶ 载入并观察' }).first().click()
    await page.locator(SCENE_CANVAS).waitFor()
    // The window has to be filled before the first measurement means anything:
    // this lesson records ~322 000 records per second of sim time, and the log
    // is reading the first 500 µs of it.
    await expect(page.locator(CLOCK).first()).toHaveText('t = 0.000 000 000 s')

    // 1. The first frame after a lesson loads. The reader asked for this scene
    //    and the playhead is at its start; the marker is the newest record at
    //    or before it, which in this lesson is ~80 rows down the batch.
    let isDrawer = await openLog(page)
    await expectMarkerInView(page, 'after loading the lesson')
    await closeLog(page, isDrawer)

    // 2. The transport's own steps. 21 of them, so the window has moved on to
    //    records that were not in it at load.
    const nextEv = page.locator('button[title="next event"]')
    for (let i = 0; i < 21; i++) await nextEv.click()
    isDrawer = await openLog(page)
    await expectMarkerInView(page, 'after 事件 → x21')
    await closeLog(page, isDrawer)

    const nextExch = page.locator('button[title="next frame exchange"]')
    for (let i = 0; i < 10; i++) await nextExch.click()
    isDrawer = await openLog(page)
    await expectMarkerInView(page, 'after 帧交换 ⏭ x10')
    await closeLog(page, isDrawer)

    // 3. A seek on the timeline strip, which is `player.seek` and not a step:
    //    it lands between records rather than on one, which is the case the
    //    marker's "last record at or before the playhead" rule exists for.
    const strip = page.locator('canvas').last()
    const bb = await strip.boundingBox()
    expect(bb, 'the timeline strip is not on the page').not.toBeNull()
    await page.mouse.move(bb!.x + bb!.width / 2, bb!.y + bb!.height / 2)
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 120)
    await expect(page.locator(CLOCK).first()).not.toHaveText('t = 0.000 000 000 s')
    isDrawer = await openLog(page)
    await expectMarkerInView(page, 'after a 30-notch wheel seek on the strip')

    expectNothingOffScreen(await survey(page), 'course · the log after the reader moved the playhead')
  })
})

/**
 * **A jump to a moment the recording has not got to yet.**
 *
 * `Player.load` asks the worker for `LOOKAHEAD_NS` = 2 s of sim time, and a
 * lesson's playhead starts at 0, so for as long as the reader has not moved it
 * the recording ends at 2 s. Two of the course's 293 jumps point past that:
 *
 *  - `queues` 「AP 第一次因生存期丢帧」 at 2.182 806 360 s
 *  - `capstone` 「第一个触发帧」 at 2.453 384 778 s
 *
 * Clicking either on a freshly loaded lesson printed a sentence and did
 * nothing, and the sentence's advice — let the simulation run a while longer —
 * was three minutes of real time for the first and seven and a half for the
 * second at the default 1 000x slowdown, because the playhead has to reach
 * 183 ms and 453 ms for the lookahead to cover the moment. The player now holds
 * the jump and asks the worker to record as far as `JUMP_SEARCH_NS`
 * (`src/player/player.ts`).
 *
 * The test presses ▶ nowhere and touches the speed nowhere: it loads, checks
 * the clock is still at zero, clicks once, and waits for the clock to read the
 * instant. `tests/ui/eventLogWindow.test.ts` holds the arithmetic half — that
 * every jump target in the course is inside that horizon, and which two are
 * outside the lookahead — and it cannot hold this half, because "the reader
 * clicked once and arrived" is not a property of a pure function.
 */
const BEYOND_LOOKAHEAD: { lesson: string; label: string; clock: string }[] = [
  { lesson: 'queues', label: 'AP 第一次因生存期丢帧', clock: 't = 2.182 806 360 s' },
  { lesson: 'capstone', label: '第一个触发帧', clock: 't = 2.453 384 778 s' },
]

test.describe('a jump reaches past the recording, without the reader playing it', () => {
  for (const c of BEYOND_LOOKAHEAD) {
    test(`${c.lesson} · ${c.label}`, async ({ page }, info) => {
      await open(page, 'course', c.lesson)
      await page.locator('main button', { hasText: '▶ 载入并观察' }).first().click()
      await page.locator(SCENE_CANVAS).waitFor()
      // Nothing has moved the playhead: this is the state a reader is in when
      // they read the call-out and press the button. Checked here, before the
      // tap below, because at one column the transport is inside the view pane
      // (`showViewCol` in `App.tsx`) and there is no clock on the prose.
      const clock = page.locator(CLOCK).first()
      await expect(clock).toHaveText('t = 0.000 000 000 s')
      if ((info.project.use.viewport?.width ?? 0) < 700) {
        await page.locator('header button', { hasText: '课文' }).click()
      }

      await page.locator('main button', { hasText: c.label }).first().click()
      await expect(page.getByText(JUMP_FAILED), 'the jump gave up instead of waiting').toHaveCount(0)
      // 25 s: the worker has to simulate past the instant from scratch, which is
      // ~0.7 s for `queues` and ~1.4 s for `capstone` on a developer machine.
      await expect(clock, 'the jump never arrived').toHaveText(c.clock, { timeout: 25_000 })
      // Nothing is playing — the arrival was the jump's doing and not a clock
      // that happened to run there.
      await expect(page.locator('button', { hasText: '▶ 播放' }).first()).toBeVisible()
    })
  }
})
