### Task 13: Glossary, Guide, README, memory note

**Files:**
- Modify: `src/ui/glossary.ts` (new group `amp`: AMP, AMP AP, Active Tx non-AP AMP STA, backscatter (future), energizer (future), AMP Trigger, AMP Ack, ABOC, ACW, AMP SIFS, AMP-Sync/AMP-SIG, Manchester OOK; each with a value the engine uses), `src/ui/Guide.tsx` (a "7 · Ambient power (802.11bp)" section, EN and ZH), `README.md` (feature bullet, conformance rows tagged draft, known simplifications), the memory index (`C:\Users\t00965210\.claude\projects\D--wifi-sim\memory\wifi-sim-project.md`: one paragraph on the AMP slice and the 2g link)
- Test: existing `tests/ui/i18n.test.ts` / glossary tests if any

- [ ] **Step 1: Write the entries** (both languages).
- [ ] **Step 2: Full run** — `npx vitest run && npx tsc -b && npm run build` → all green, `lesson-hashes.test.ts` included.
- [ ] **Step 3: Commit** — `git commit -am "docs: AMP glossary, guide section, README and roadmap note"`.

---

