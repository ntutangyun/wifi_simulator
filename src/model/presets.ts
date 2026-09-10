/**
 * Station presets: real phones on the Chinese market, September 2026.
 *
 * What the simulator models is encoded on the preset: Wi-Fi generation,
 * feature flags, spatial streams and channel width (`widthMhz`/`nss`, fed
 * into `caps` by `capsFor` below). Wi-Fi 7 presets run at 160 MHz — Apple's
 * own documentation confirms 160 MHz for that generation, and China has no
 * 6 GHz so 320 MHz is unreachable anyway. Wi-Fi 6 presets run at 80 MHz: 160
 * MHz is optional for Wi-Fi 6 clients under 802.11ax, 80 MHz is the common
 * client configuration, and it matches Apple's published Wi-Fi 6 figure (see
 * the `apple-iphone-16e` note). Every
 * Wi-Fi 7 preset ships with MLO off: China reserves the whole 6 GHz band for
 * cellular, so China-market phones have 6 GHz disabled and the simulator's
 * MLO (a 5 GHz + 6 GHz pair) cannot form. `mloCapable` marks phones whose
 * global variant does MLO; ticking MLO in the editor models that variant.
 */
import { defaultFeatures } from './caps'
import type { ChannelWidth, Nss } from './caps'
import type { NodeCfg, ProfileId } from './scenario'
import type { Generation, Vec3 } from './types'

export type Brand = 'huawei' | 'xiaomi' | 'honor' | 'apple'
export const BRANDS: Brand[] = ['huawei', 'xiaomi', 'honor', 'apple']

export interface StationPreset {
  id: string
  brand: Brand
  model: string
  /** Release year-month, for the label. */
  released: string
  generation: Generation
  /** The global variant supports 6 GHz + MLO (never on by default: see file header). */
  mloCapable: boolean
  /** Operating channel width the device supports, in MHz. */
  widthMhz: ChannelWidth
  /** Spatial streams. Every phone on this list is 2×2. */
  nss: Nss
  /** Default traffic mix — what this kind of phone usually does at home. */
  profiles: ProfileId[]
  note: { en: string; zh: string }
}

const P = (
  id: string, brand: Brand, model: string, released: string, generation: Generation,
  mloCapable: boolean, profiles: ProfileId[], en: string, zh: string,
  widthMhz: ChannelWidth = 160, nss: Nss = 2,
): StationPreset => ({ id, brand, model, released, generation, mloCapable, widthMhz, nss, profiles, note: { en, zh } })

export const STATION_PRESETS: StationPreset[] = [
  // Huawei — Kirin Wi-Fi 7, 2×2; dual-band on the Chinese market
  P('huawei-mate-80-pro', 'huawei', 'Huawei Mate 80 Pro', '2025-11', 'eht', false, ['browsing', 'voice'],
    'Wi-Fi 7, 2×2, dual-band (2.4/5 GHz); Kirin 9030.', 'Wi-Fi 7，2×2，双频（2.4/5 GHz）；麒麟 9030。'),
  P('huawei-pura-80-ultra', 'huawei', 'Huawei Pura 80 Ultra', '2025-06', 'eht', false, ['video', 'browsing'],
    'Wi-Fi 7, 2×2, 160 MHz (EHT160), 8-stream sounding MU-MIMO.', 'Wi-Fi 7，2×2，160 MHz（EHT160），8 流探测 MU-MIMO。'),
  P('huawei-mate-60-pro', 'huawei', 'Huawei Mate 60 Pro', '2023-09', 'he', false, ['browsing'],
    'Wi-Fi 6 (802.11ax), 2×2; Kirin 9000S. Still everywhere. Modelled at 80 MHz: no documented per-device figure for this handset, but 160 MHz is optional for Wi-Fi 6 clients under 802.11ax, 80 MHz is the common client configuration, and it matches Apple’s published Wi-Fi 6 width.',
    'Wi-Fi 6（802.11ax），2×2；麒麟 9000S。保有量仍然很大。仿真按 80 MHz 建模：没有这款机型的官方带宽数据，但 160 MHz 对 802.11ax 的 Wi-Fi 6 终端只是可选特性，80 MHz 才是常见配置，也与苹果公布的 Wi-Fi 6 带宽一致。', 80),
  // Xiaomi — Snapdragon 8 Elite Gen 5; global units do 6 GHz + MLO
  P('xiaomi-17-ultra', 'xiaomi', 'Xiaomi 17 Ultra', '2026-02', 'eht', true, ['video', 'gaming'],
    'Wi-Fi 7, 2×2, up to 5.8 Gbps; MLO and 6 GHz on the global unit.', 'Wi-Fi 7，2×2，最高 5.8 Gbps；国际版支持 MLO 与 6 GHz。'),
  P('xiaomi-17-pro-max', 'xiaomi', 'Xiaomi 17 Pro Max', '2025-09', 'eht', true, ['gaming'],
    'Wi-Fi 7, 2×2; Snapdragon 8 Elite Gen 5.', 'Wi-Fi 7，2×2；骁龙 8 Elite Gen 5。'),
  P('xiaomi-redmi-k90-pro-max', 'xiaomi', 'Redmi K90 Pro Max', '2025-10', 'eht', true, ['gaming'],
    'Wi-Fi 7; the gaming-oriented performance flagship.', 'Wi-Fi 7；面向游戏的性能旗舰。'),
  P('xiaomi-redmi-note-15-pro-plus', 'xiaomi', 'Redmi Note 15 Pro+', '2025-08', 'he', false, ['video'],
    'Wi-Fi 6 (802.11ax), 2×2. Modelled at 80 MHz: no documented per-device figure for this handset, but 160 MHz is optional for Wi-Fi 6 clients under 802.11ax, 80 MHz is the common client configuration, and it matches Apple’s published Wi-Fi 6 width.',
    'Wi-Fi 6（802.11ax），2×2。仿真按 80 MHz 建模：没有这款机型的官方带宽数据，但 160 MHz 对 802.11ax 的 Wi-Fi 6 终端只是可选特性，80 MHz 才是常见配置，也与苹果公布的 Wi-Fi 6 带宽一致。', 80),
  // Honor
  P('honor-magic8-pro', 'honor', 'Honor Magic8 Pro', '2025-10', 'eht', true, ['browsing', 'voice'],
    'Wi-Fi 7, 2×2; Snapdragon 8 Elite Gen 5.', 'Wi-Fi 7，2×2；骁龙 8 Elite Gen 5。'),
  P('honor-magic-v6', 'honor', 'Honor Magic V6', '2026-03', 'eht', true, ['video'],
    'Foldable; Wi-Fi 7 (802.11be), 2×2.', '折叠屏；Wi-Fi 7（802.11be），2×2。'),
  P('honor-500', 'honor', 'Honor 500', '2025-11', 'eht', true, ['browsing'],
    'Wi-Fi 7; Snapdragon 8s Gen 4, 8000 mAh.', 'Wi-Fi 7；骁龙 8s Gen 4，8000 mAh。'),
  P('honor-x9d', 'honor', 'Honor X9d', '2025-09', 'he', false, ['browsing'],
    'Wi-Fi 6 (802.11ax), dual-band; rugged mid-ranger. Modelled at 80 MHz: no documented per-device figure for this handset, but 160 MHz is optional for Wi-Fi 6 clients under 802.11ax, 80 MHz is the common client configuration, and it matches Apple’s published Wi-Fi 6 width.',
    'Wi-Fi 6（802.11ax），双频；耐用中端机。仿真按 80 MHz 建模：没有这款机型的官方带宽数据，但 160 MHz 对 802.11ax 的 Wi-Fi 6 终端只是可选特性，80 MHz 才是常见配置，也与苹果公布的 Wi-Fi 6 带宽一致。', 80),
  // Apple — N1 chip: Wi-Fi 7 at 160 MHz (no 320 MHz), 2×2, MLO on non-China units
  P('apple-iphone-17-pro', 'apple', 'iPhone 17 Pro', '2025-09', 'eht', true, ['video', 'voice'],
    'Apple N1: Wi-Fi 7, 2×2, 160 MHz max; China unit (A3524) without 6 GHz. Modelled without 4096-QAM: Apple publishes 2400 Mbps for Wi-Fi 7 at 160 MHz / 2 streams — the 1024-QAM (MCS 11) rate, not the 2882 Mbps 4096-QAM (MCS 13) would allow.',
    '苹果 N1：Wi-Fi 7，2×2，最大 160 MHz；国行（A3524）无 6 GHz。仿真不建模 4096-QAM：苹果公布的 Wi-Fi 7、160 MHz、2 流速率是 2400 Mbps——对应 1024-QAM（MCS 11），而不是 4096-QAM（MCS 13）能达到的 2882 Mbps。'),
  P('apple-iphone-air', 'apple', 'iPhone Air', '2025-09', 'eht', true, ['browsing'],
    'Apple N1: Wi-Fi 7, 2×2, 160 MHz max. Modelled without 4096-QAM: Apple publishes 2400 Mbps for Wi-Fi 7 at 160 MHz / 2 streams — the 1024-QAM (MCS 11) rate, not the 2882 Mbps 4096-QAM (MCS 13) would allow.',
    '苹果 N1：Wi-Fi 7，2×2，最大 160 MHz。仿真不建模 4096-QAM：苹果公布的 Wi-Fi 7、160 MHz、2 流速率是 2400 Mbps——对应 1024-QAM（MCS 11），而不是 4096-QAM（MCS 13）能达到的 2882 Mbps。'),
  P('apple-iphone-17', 'apple', 'iPhone 17', '2025-09', 'eht', true, ['gaming'],
    'Apple N1: Wi-Fi 7, 2×2, 160 MHz max. Modelled without 4096-QAM: Apple publishes 2400 Mbps for Wi-Fi 7 at 160 MHz / 2 streams — the 1024-QAM (MCS 11) rate, not the 2882 Mbps 4096-QAM (MCS 13) would allow.',
    '苹果 N1：Wi-Fi 7，2×2，最大 160 MHz。仿真不建模 4096-QAM：苹果公布的 Wi-Fi 7、160 MHz、2 流速率是 2400 Mbps——对应 1024-QAM（MCS 11），而不是 4096-QAM（MCS 13）能达到的 2882 Mbps。'),
  P('apple-iphone-16e', 'apple', 'iPhone 16e', '2025-02', 'he', false, ['voice'],
    'Apple support.apple.com spec: ax@5 GHz, 1200 Mbps, 80 MHz, 2×2 — Wi-Fi 6 iPhones ship at 80 MHz, not 160 MHz.',
    '苹果 support.apple.com 规格：ax@5 GHz、1200 Mbps、80 MHz、2×2——Wi-Fi 6 版 iPhone 出厂就是 80 MHz，不是 160 MHz。', 80),
]

/** A phone is a 2×2 handset radio: modest power. */
const PHONE_TX_POWER_DBM = 15

function capsFor(p: StationPreset): NodeCfg['caps'] {
  const features = defaultFeatures(p.generation) as Record<string, boolean>
  if (p.generation === 'eht') features.mlo = false // Chinese market: no 6 GHz
  // Apple's N1 radio does not implement 4096-QAM (see the Apple eht presets'
  // notes): Apple's own published Wi-Fi 7 figure, 2400 Mbps at 160 MHz / 2
  // streams, is the 1024-QAM (MCS 11) rate, not the 2882 Mbps MCS 13 would
  // allow. Non-Apple eht presets keep qam4k on — Qualcomm/MediaTek flagship
  // Wi-Fi 7 radios do implement it, and those vendors publish no figure that
  // contradicts it.
  if (p.generation === 'eht' && p.brand === 'apple') features.qam4k = false
  return { generation: p.generation, features, widthMhz: p.widthMhz, nss: p.nss }
}

/** Overwrite a node's identity and radio with a preset; id, position and height stay. */
export function applyPreset(n: NodeCfg, p: StationPreset): NodeCfg {
  return {
    ...n,
    name: p.model,
    caps: capsFor(p),
    linkId: undefined,
    profiles: [...p.profiles],
    txPowerDbm: PHONE_TX_POWER_DBM,
  }
}

export function presetNode(p: StationPreset, id: string, pos: Vec3): NodeCfg {
  return applyPreset({ id, kind: 'sta', name: p.model, pos, txPowerDbm: PHONE_TX_POWER_DBM, profiles: [], caps: capsFor(p) }, p)
}
