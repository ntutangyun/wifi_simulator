# Task 7 report: Frame detail for AMP frames

## What

Implemented the field-level MAC decode and PPDU layout for the three P802.11bp AMP frame
kinds (`ampTrigger`, `ampAck`, `ampResp`) in `src/model/frameFields.ts`, replacing the Task 1
placeholder (`case 'ampTrigger': case 'ampAck': case 'ampResp': fields = [{key:'body', ...}]`).
Wired the new `FieldKey`/`PpduSegmentKey` union members into `src/ui/i18n.ts` (both `en`/`zh`
tables) and made a minimal rendering fix in `src/ui/FrameDetail.tsx`. Finalised the `whatIs`/
`next` prose for the three AMP kinds in both languages.

## TDD evidence

1. Appended the brief's exact `describe('AMP frames decode to their P802.11bp fields and PPDU
   layout', ...)` block (two `it`s) to `tests/model/frameFields.test.ts`, importing
   `ampAckFrame`, `ampRespFrame`, `ampTriggerFrame` from `src/engine/amp`.
2. Ran `npx vitest run tests/model/frameFields.test.ts` — 2 new tests failed as expected
   (`ampId`/`ampTdc`/`ampStaList` fields absent; PPDU still fell through to the generic
   non-AMP `ppduLayout`, which throws/mis-segments for AMP frames).
3. Implemented `controlMpdu`'s three AMP cases and `ampPpduLayout` (dispatched from
   `ppduLayout` via `if (f.amp) return ampPpduLayout(f)`) verbatim per the brief.
4. Re-ran — both new tests pass; all 13 tests in the file pass, including the pre-existing
   byte-sum/segment-sum invariants over recorded lesson frames.

## Suites run

- `npx vitest run tests/model tests/ui tests/engine/lesson-hashes.test.ts` → **15 files, 123
  tests, all passing** (includes `tests/ui/i18n.test.ts` covering `whatIs`/`next` non-empty
  for all `FrameKind`s including the three AMP kinds, and `lesson-hashes.test.ts` confirming
  existing scenarios are bit-identical).
- `npx tsc -b` → clean, no errors.

## Files changed

- `src/model/frameFields.ts`
  - Import AMP constants/helpers from `../engine/amp` (`AMP_ACK_BYTES`, `AMP_DL_SIG_BYTES`,
    `AMP_DL_SYNC_NS`, `AMP_FCS_BYTES`, `AMP_LEGACY_PREAMBLE_NS`, `AMP_PADDING_NS`,
    `AMP_READING_BYTES`, `AMP_STA_ID_BYTES`, `AMP_TRIGGER_BODY_BYTES`, `AMP_UL_CHIP_NS`,
    `AMP_UL_SYNC_CHIPS`, `ampBitsNs`, `ampId16`, `type AmpUlKbps`).
  - `FieldKey` gains `'ampId' | 'ampTdc' | 'ampStaList'`.
  - `PpduSegmentKey` gains `'usig' | 'ampSync' | 'ampSig' | 'ampData' | 'signalExt'`.
  - Removed the three now-dead `SUBTYPE_BITS` placeholder entries (`'AMP Trigger': '—'`, etc.)
    — confirmed via grep that `fcField()`/`SUBTYPE_BITS` is never invoked for the AMP kinds
    (their `fc` field is built directly with only `type`/`protected` bits), so these were
    unused leftovers from Task 1, not load-bearing.
  - `controlMpdu`: real `ampTrigger`/`ampAck`/`ampResp` cases per the brief, each ending in
    `checkSize(...)` against the engine's own byte accounting.
  - New `ampPpduLayout(f)` (DL: legacy preamble + U-SIG + AMP-Sync/SIG/Data + padding [+
    signal extension]; UL: AMP-Sync + AMP-Data only), dispatched from `ppduLayout` before the
    existing non-AMP logic.
- `src/ui/i18n.ts` (`en` and `zh`, both tables, diff scoped to intended hunks only — verified
  with `git diff`):
  - `fields.name`: added `ampId`, `ampTdc`, `ampStaList`.
  - `fields.segment`: added `usig`, `ampSync`, `ampSig`, `ampData`, `signalExt`.
  - `whatIs.ampTrigger/ampAck/ampResp` and `next.ampTrigger/ampAck/ampResp`: rewritten to two
    sentences each, both languages, each citing "P802.11bp draft" / "P802.11bp 草案".
  - Fixed the two reviewer-flagged zh issues: `whatIs.ampTrigger`'s 命名 replaced with
    划出/规定 ("划出 N 个上行时隙，并规定标签如何选定其中一个"); `whatIs.ampAck`'s awkward
    "靠自身供电发送，而不是电池供电的电台" replaced with a clearer AP-powered-vs-harvested-
    power contrast ("同样由 AP 正常供电发出的 OOK PPDU，用来关闭…由标签以反向散射能量作答的
    那个时隙").
- `src/ui/FrameDetail.tsx`:
  - `SEG_COLOR` (a `Record<PpduSegmentKey, string>`) extended with the 5 new segment keys
    (reusing the existing 4-color palette by PHY role: SIG-ish → pink, sync/preamble-ish →
    purple, data → blue, padding/ext → gray) — required for `tsc -b` to pass and for the
    timeline bar to render every AMP segment with a color.
  - `fieldValue()` rendering fix: the generic renderer always built `{name} ({roles})` for any
    field with `node` set, silently dropping `x.value`. The brief's `ampAck`/`ampResp` `ampId`
    fields set *both* `node` (for the display name via `nameOf`) and `value` (the raw on-air
    hex id, or the "AP id (nothing received)" self-ack case) with no `roles`. Under the old
    code this rendered as `"tag-1 ()"` — the hex id / no-response text was invisible. Changed
    it to fall back to `x.value` as the parenthetical detail when `roles` is absent, so address
    fields (which always set `roles`, never `value`) render unchanged, and AMP id fields now
    show both the friendly name and the wire-level detail.

## Self-review

- Byte sums: `checkSize(fields, f.bytes)` (trigger, resp) / `checkSize(fields, AMP_ACK_BYTES)`
  (ack) enforce the invariant at decode time; test asserts `[['fc',1],['ampId',2],['ampTdc',2],
  ['body',6],['fcs',2]]` = 13 for the unscheduled trigger, `d.bytes === 13`, the scheduled
  trigger's `ampStaList` at 4 bytes (2 ids × `AMP_STA_ID_BYTES`), the Ack's exact
  `[['fc',1],['ampId',2],['fcs',1]]` = 4, and the reading-response's `body` 8 bytes.
- Segment sums: `d.ppdu.reduce(...) === f.txTimeNs` asserted for both trigger and response;
  `ampSig` pinned at 64 000 ns and UL `ampSync` at 48 000 ns per the brief.
- No placeholder left: the old `// Placeholder decode; the real AMP frame layout is added in
  Task 7.` comment and its `body`-only field are gone; `SUBTYPE_BITS`'s `'—'` placeholders for
  the three AMP subtype names are removed (confirmed unused).
- Both language tables complete: `tests/ui/i18n.test.ts` iterates `KINDS` (includes the three
  AMP kinds) over both `en`/`zh` asserting non-empty `kindName`/`whatIs`/`next`; `tsc -b`
  additionally enforces `Record<FieldKey, ...>` / `Record<PpduSegmentKey, ...>` completeness in
  both language tables (this is what caught the pre-fix compile errors).
- Test output pristine: `npx vitest run tests/model tests/ui tests/engine/lesson-hashes.test.ts`
  → 15 files / 123 tests, all green, no console noise; `npx tsc -b` → no output (clean).
- `git diff -- src/ui/i18n.ts` reviewed line-by-line: only the six `whatIs`/`next` AMP entries
  (both languages) and the two `fields.name`/`fields.segment` additions (both languages)
  changed — no accidental edits elsewhere in the file.

## Concerns

- None blocking. Two judgment calls worth flagging for review:
  1. Removed the three dead `SUBTYPE_BITS` placeholder entries rather than filling them with
     real bit patterns — the brief's own `fc` field construction for AMP frames never reads
     `SUBTYPE_BITS` (it builds `bits: [{key:'type',...},{key:'protected',...}]` directly), so
     those entries would stay permanently unused/misleading if left as `'—'`.
  2. `FrameDetail.tsx`'s `fieldValue()` fallback (`roles` absent → show `value`) is a genuine
     behavior change to a shared render path, though it's a no-op for every existing field
     (only the two new AMP `ampId` fields set `node` without `roles`). Flagged in the diff
     comment for the reviewer's attention per the brief's instruction to report any such
     adjustment.

## Commit

`d9ca763 feat(frame-detail): field-level decode and PPDU layout of AMP frames`
