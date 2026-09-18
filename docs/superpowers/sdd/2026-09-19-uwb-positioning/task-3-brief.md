### Task 3: Guide section, glossary group, README rows

**Files:**
- Modify: `src/ui/Guide.tsx` (section "11 · UWB ranging" EN and ZH: what a ranging counter is, RMARKER, SS vs DS in two sentences, blocks/rounds/slots, what the rings and the ellipse mean incl. the 3× draw factor, the model numbers), `src/ui/glossary.ts` (group `uwb` with the spec's term list: UWB, HRP UWB PHY, RMARKER, ranging counter / RCTU, RSTU, STS, SP1, SS-TWR, DS-TWR, ranging block / round / slot, controller / controlee, initiator / responder, RRTI / RMI / ARC / RDM IE, FoM, NLOS, GDOP, error ellipse — each with the value the engine uses), `README.md` (feature bullet; a conformance table "802.15.4-2024 HRP UWB ranging" with rows standard / FiRa / model like the AMP rows; known simplifications: no CCA, sensitivity-only reception, 2-D fix, no AoA/TDoA)
- Test: `tests/ui/uwb-guide.test.ts`: the glossary group exists with ≥ 18 items, every item bilingual; the Guide renders (react-dom/server `renderToStaticMarkup`) with the heading "11 · UWB ranging" in EN and "11 · UWB 测距" in ZH; README contains the conformance heading.

- [ ] **Step 1: Write the failing test.** **Step 2–4:** implement, run, build. **Step 5: Commit** `docs(uwb): guide section, glossary group and README conformance rows`.

---

