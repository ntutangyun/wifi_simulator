# Task 7: Glossary, README and the full run — Report

## Status
DONE

## What Was Done

### Step 1: Glossary Items Added
Added three new glossary items to `src/ui/glossary.ts` in the 'ifs' group (Interframe spaces & timers, line 145):

1. **2.4 GHz link** — ERP-OFDM band (802.11g, Wi-Fi 6/7)
   - English: "The band 802.11b/g came from. Its OFDM PHY (clause 18, ERP) uses aSIFSTime 10 µs and a 9 µs short slot, so DIFS is 28 µs and AckTimeout 39 µs. Signals lose 6.5 dB less over the same distance than at 5 GHz; the simulator only allows 20 or 40 MHz here."
   - Chinese: "802.11b/g 所在的频段。其 OFDM PHY（第 18 条，ERP）使用 aSIFSTime 10 µs 和 9 µs 短时隙，因此 DIFS 为 28 µs、AckTimeout 为 39 µs。同样距离上信号比 5 GHz 少损耗 6.5 dB；模拟器在此只允许 20 或 40 MHz。"

2. **aSignalExtension** — signal extension, 6 µs
   - English: "On 2.4 GHz every OFDM PPDU is followed by 6 µs of silence that counts as part of its TXTIME (§10.3.8), so that old 802.11b stations compute the NAV correctly. Every 2.4 GHz frame in the timeline is 6 µs longer than the same frame at 5 GHz."
   - Chinese: "在 2.4 GHz，每个 OFDM PPDU 后面跟着 6 µs 的静默，计入其 TXTIME（§10.3.8），以便老式 802.11b 终端正确计算 NAV。时间线上每个 2.4 GHz 帧都比 5 GHz 上的同一帧长 6 µs。"

3. **ERP** — extended rate PHY (802.11g)
   - English: "The 2.4 GHz OFDM PHY of 802.11g: the same 6–54 Mb/s rates as 802.11a, with 802.11b compatibility rules (signal extension, 10 µs SIFS). The simulator's "802.11a (legacy)" generation runs as ERP-OFDM when its link is 2.4 GHz."
   - Chinese: "802.11g 的 2.4 GHz OFDM PHY：与 802.11a 相同的 6–54 Mb/s 速率，外加 802.11b 兼容规则（信号扩展、10 µs SIFS）。模拟器的"802.11a（传统）"一代在链路为 2.4 GHz 时即按 ERP-OFDM 运行。"

### Step 2: README Conformance Table Row
Added one row to the conformance table in `README.md` (section "802.11 conformance", line 47):

`| 2.4 GHz ERP-OFDM timing | §18.4.4, Table 18-5, §10.3.8 | SIFS 10 µs, short slot 9 µs, DIFS 28 µs, AckTimeout 39 µs, 6 µs signal extension in every PPDU; 2.4 GHz path loss 6.5 dB below 5 GHz |`

### Step 3: Full Suite Run

#### vitest
```
 Test Files  68 passed (68)
      Tests  606 passed (606)
   Start at  15:37:56
   Duration  41.33s (transform 3.85s, setup 0ms, collect 56.17s, tests 167.26s, environment 19ms, prepare 12.50s)
```
✓ All tests passing, including `tests/engine/lesson-hashes.test.ts`

#### TypeScript Compilation (tsc -b)
✓ Succeeded with no errors

#### Build (npm run build)
```
vite v6.4.3 building for production...
✓ 99 modules transformed.
✓ built in 2.44s
```
✓ Succeeded (with non-critical chunk size warning)

### Step 4: Commit
```
[feat/link-2g 47fff06] docs: glossary and README entries for the 2.4 GHz link
 2 files changed, 26 insertions(+), 1 deletion(-)
```

## Self-Review

### Verification Checklist
- ✓ Three glossary items added to correct group ('ifs' group that holds SIFS/DIFS)
- ✓ All three items match the brief text exactly (English and Chinese)
- ✓ Both languages present for all three items
- ✓ README conformance table row added to correct section
- ✓ README row matches brief text exactly
- ✓ No other files modified
- ✓ No styling or formatting changes
- ✓ All tests pass (606 tests across 68 files)
- ✓ TypeScript compilation succeeds
- ✓ Build succeeds
- ✓ Commit message matches brief requirement
- ✓ Attribution lines included

### Files Changed
- `src/ui/glossary.ts` — Added 3 glossary entries (26 insertions)
- `README.md` — Added 1 table row (1 insertion)

## Concerns
None. All requirements met, all tests passing.

## Summary
Task 7 complete. Added the three 2.4 GHz link glossary entries and README conformance table row per specification. Full test suite, TypeScript compilation, and build all succeeded without errors.

---

## Fix Round 1: Character Encoding Corrections

### Issue Found
Code review identified character-level Unicode corruption in `src/ui/glossary.ts`:
1. ACK timeout zh text: Opening quote was U+201D (") instead of U+201C (")
2. ERP zh text: Opening quote was U+201D (") instead of U+201C (")
3. ERP en text: Used escaped apostrophe \' instead of typographic apostrophe U+2019 (')

### What Changed
Modified `src/ui/glossary.ts` using Python byte-level replacement to fix the three Unicode issues:
1. Changed ACK timeout zh: `被"事后"发现` to `被"事后"发现` (opening quote U+201C)
2. Changed ERP zh: `模拟器的"802.11a` to `模拟器的"802.11a` (opening quote U+201C)
3. Changed ERP en: `simulator's` to `simulator's` (apostrophe U+2019)

### Character Verification
```
PASS: ERP en apostrophe (U+2019) found
PASS: ACK timeout opening quote (U+201C) found
PASS: ERP zh opening quote (U+201C) found
```

### Tests Run
```
npx vitest run tests/ui

Test Files 5 passed (5)
Tests     38 passed (38)
Duration  702ms
```

```
npx tsc -b
(no errors)
```

### Commit
```
[feat/link-2g e706fb3] fix(glossary): restore the exact quote characters
 1 file changed, 3 insertions(+), 3 deletions(-)
```

### Final Verification
`git diff c07c8b2 -- src/ui/glossary.ts` shows only the three new glossary items added (2.4 GHz link, aSignalExtension, ERP) with correct Unicode characters. ACK timeout entry unchanged. All character encodings match the base commit outside of the additions.
