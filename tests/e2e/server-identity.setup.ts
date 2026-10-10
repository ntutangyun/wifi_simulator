/**
 * **Before any of the sweep runs: is the server on this port serving THIS working tree?**
 *
 * `playwright.config.ts` hard-codes `PORT` and sets `reuseExistingServer: !CI`, and both stay.
 * The alternative — making every local run own its own server — brings back the Windows
 * teardown that file documents at length, where an unaided completion has never been observed
 * in this shell and one protected attempt was still silent after an hour. Reuse is the reason
 * `npx playwright test` finishes here at all.
 *
 * The cost of reuse is that the suite trusts whatever answers on that port. The dev server in
 * use on this machine was started on 2026-10-05, and several slices in a row checked by hand
 * with `curl` that it was still serving current code. It always was. But a `curl` somebody
 * remembers to run is not an instrument — this repository's own phrase is 「脚本不是测试」 —
 * and a check that depends on being remembered is missing on exactly the run that needed it.
 *
 * **What this proves, and what it does not.** It writes a file carrying a fresh nonce into
 * this working tree and asks the server for it. Vite's dev middleware transforms any module
 * under its root on demand, so getting the nonce back means the server is reading from this
 * directory — its root is this tree. It does NOT prove the server is running this tree's
 * `vite.config.ts`, its dependencies, or that it was restarted after any particular change:
 * only that the files it serves are the files on disk here, which is the property reuse
 * assumes and the one the hand-`curl` was reaching for.
 *
 * **Why the body is read and not the status, which is the whole trick.** A dev server rooted
 * somewhere else does not answer 404. Measured on 2026-10-10 against the server on 5173,
 * whose root is the main checkout rather than this worktree: `GET` of a path that exists only
 * here returned **200**, `content-type: text/html` — Vite's SPA fallback, serving that
 * project's own `index.html`. A check on `res.ok()` alone passes against the wrong tree, so
 * the content type must be JavaScript and the body must contain the nonce.
 *
 * It runs as a setup project the three viewport projects depend on, so a plain
 * `npx playwright test` cannot reach the sweep without it, and a failure stops the run
 * instead of producing a green sweep over somebody else's code. It needs no browser and no
 * new dependency: Playwright's own `request` fixture, `node:fs` and `node:crypto`.
 *
 * One honest gap: `--grep` filters this test out along with everything else that does not
 * match, so `npx playwright test -g "…"` runs the sweep unchecked. The contract is the full
 * run.
 */
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/**
 * Where the nonce goes. A directory whose name ends in `.local`, which `.gitignore` already
 * covers wholesale (`*.local`, the same line that covers `probes.local/`), so a run killed
 * half way through cannot leave anything committable behind. It is outside `src/` and
 * `tests/`, so the repository-wide source walks do not reach it, and `tsconfig.json` includes
 * only those two, so `tsc` never sees it either.
 */
const DIR = path.join(ROOT, 'e2e-identity.local')

test('the dev server being reused is serving this working tree', async ({ request, baseURL }) => {
  const nonce = `e2e-identity-${randomUUID()}`
  const name = `${nonce}.ts`
  const file = path.join(DIR, name)
  const urlPath = `/e2e-identity.local/${name}`

  fs.mkdirSync(DIR, { recursive: true })
  fs.writeFileSync(file, `export const NONCE = '${nonce}'\n`, 'utf8')

  /** One failure message, with the next person's whole move in it. */
  const advice = (what: string): string =>
    `${what}\n`
    + `    Asked: ${baseURL}${urlPath}\n`
    + `    Wrote: ${file}\n`
    + '    What it means: whatever is answering that port is NOT reading files from this\n'
    + '    working tree, so every test after this one would have measured another checkout\'s\n'
    + '    code and passed or failed for reasons unconnected to your change.\n'
    + '    What to do, in order:\n'
    + '      1. Find what owns the port:  netstat -ano | findstr :<PORT>\n'
    + '         then  Get-CimInstance Win32_Process -Filter "ProcessId = <pid>" |\n'
    + '               Select-Object CreationDate, CommandLine\n'
    + '      2. If its command line is not rooted in this worktree, it is another checkout\'s\n'
    + '         dev server. Do not reflexively kill it: `playwright.config.ts` records a\n'
    + '         measurement that was destroyed by exactly that, and 5173 belongs to the person\n'
    + '         using this machine. Check its start time against any suite in flight first,\n'
    + '         and say so to whoever else is on the box.\n'
    + '      3. The safe fix is a port of your own: set `PORT` in `playwright.config.ts` to one\n'
    + '         nothing is on, let Playwright start and own that server, and read the verdict\n'
    + '         off the per-test lines — the teardown on this box may not return.\n'
    + '    CI never reaches this branch: `reuseExistingServer` is false there, so the server is\n'
    + '    always one the run has just started.'

  try {
    const res = await request.get(urlPath)

    expect(res.status(), advice(`The server answered ${res.status()} for a file this run just wrote.`))
      .toBe(200)

    // The discriminating assertion: the wrong server answers 200 with its own index.html.
    const type = res.headers()['content-type'] ?? ''
    expect(type, advice(`The server answered with \`${type}\` rather than JavaScript, which is`
      + ' what Vite\'s SPA fallback does for a path that does not exist under its root.'))
      .toMatch(/javascript/)

    const body = await res.text()
    expect(body.includes(nonce), advice('The server answered with JavaScript that does not'
      + ' contain the nonce this run just wrote.'))
      .toBe(true)
  } finally {
    fs.rmSync(file, { force: true })
    try {
      fs.rmdirSync(DIR)
    } catch {
      // another run's nonce is still in there, which is its business
    }
  }
})
