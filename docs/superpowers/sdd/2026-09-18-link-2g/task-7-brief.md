### Task 7: Glossary, README and the full run

**Files:**
- Modify: `src/ui/glossary.ts` (add three items to the group whose id is `'phy'` or the timing group; `grep -n "id: '" src/ui/glossary.ts` to pick the group that holds SIFS/DIFS)
- Modify: `README.md` (conformance table: add a row)

- [ ] **Step 1: Glossary items** (term / alt / def in both languages):

```ts
      {
        term: '2.4 GHz link',
        alt: { en: 'ERP-OFDM band (802.11g, Wi-Fi 6/7)', zh: '2.4 GHz 频段（802.11g、Wi-Fi 6/7）' },
        def: {
          en: 'The band 802.11b/g came from. Its OFDM PHY (clause 18, ERP) uses aSIFSTime 10 µs and a 9 µs short slot, so DIFS is 28 µs and AckTimeout 39 µs. Signals lose 6.5 dB less over the same distance than at 5 GHz; the simulator only allows 20 or 40 MHz here.',
          zh: '802.11b/g 所在的频段。其 OFDM PHY（第 18 条，ERP）使用 aSIFSTime 10 µs 和 9 µs 短时隙，因此 DIFS 为 28 µs、AckTimeout 为 39 µs。同样距离上信号比 5 GHz 少损耗 6.5 dB；模拟器在此只允许 20 或 40 MHz。',
        },
      },
      {
        term: 'aSignalExtension',
        alt: { en: 'signal extension, 6 µs', zh: '信号扩展，6 µs' },
        def: {
          en: 'On 2.4 GHz every OFDM PPDU is followed by 6 µs of silence that counts as part of its TXTIME (§10.3.8), so that old 802.11b stations compute the NAV correctly. Every 2.4 GHz frame in the timeline is 6 µs longer than the same frame at 5 GHz.',
          zh: '在 2.4 GHz，每个 OFDM PPDU 后面跟着 6 µs 的静默，计入其 TXTIME（§10.3.8），以便老式 802.11b 终端正确计算 NAV。时间线上每个 2.4 GHz 帧都比 5 GHz 上的同一帧长 6 µs。',
        },
      },
      {
        term: 'ERP',
        alt: { en: 'extended rate PHY (802.11g)', zh: '扩展速率 PHY（802.11g）' },
        def: {
          en: 'The 2.4 GHz OFDM PHY of 802.11g: the same 6–54 Mb/s rates as 802.11a, with 802.11b compatibility rules (signal extension, 10 µs SIFS). The simulator’s “802.11a (legacy)” generation runs as ERP-OFDM when its link is 2.4 GHz.',
          zh: '802.11g 的 2.4 GHz OFDM PHY：与 802.11a 相同的 6–54 Mb/s 速率，外加 802.11b 兼容规则（信号扩展、10 µs SIFS）。模拟器的“802.11a（传统）”一代在链路为 2.4 GHz 时即按 ERP-OFDM 运行。',
        },
      },
```

- [ ] **Step 2: README row** in the conformance table:
`| 2.4 GHz ERP-OFDM timing | §18.4.4, Table 18-5, §10.3.8 | SIFS 10 µs, short slot 9 µs, DIFS 28 µs, AckTimeout 39 µs, 6 µs signal extension in every PPDU; 2.4 GHz path loss 6.5 dB below 5 GHz |`

- [ ] **Step 3: Full suite and build**

Run: `npx vitest run && npx tsc -b && npm run build`
Expected: all green, including `tests/engine/lesson-hashes.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/glossary.ts README.md
git commit -m "docs: glossary and README entries for the 2.4 GHz link"
```
