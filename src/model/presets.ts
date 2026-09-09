/**
 * Station presets: real phones on the Chinese market, September 2026.
 *
 * Only what the simulator models is encoded — Wi-Fi generation and feature
 * flags. Spatial streams and channel width are informational (`note`). Every
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
    'Wi-Fi 6 (802.11ax), 2×2; Kirin 9000S. Still everywhere.', 'Wi-Fi 6（802.11ax），2×2；麒麟 9000S。保有量仍然很大。'),
  // Xiaomi — Snapdragon 8 Elite Gen 5; global units do 6 GHz + MLO
  P('xiaomi-17-ultra', 'xiaomi', 'Xiaomi 17 Ultra', '2026-02', 'eht', true, ['video', 'gaming'],
    'Wi-Fi 7, 2×2, up to 5.8 Gbps; MLO and 6 GHz on the global unit.', 'Wi-Fi 7，2×2，最高 5.8 Gbps；国际版支持 MLO 与 6 GHz。'),
  P('xiaomi-17-pro-max', 'xiaomi', 'Xiaomi 17 Pro Max', '2025-09', 'eht', true, ['gaming'],
    'Wi-Fi 7, 2×2; Snapdragon 8 Elite Gen 5.', 'Wi-Fi 7，2×2；骁龙 8 Elite Gen 5。'),
  P('xiaomi-redmi-k90-pro-max', 'xiaomi', 'Redmi K90 Pro Max', '2025-10', 'eht', true, ['gaming'],
    'Wi-Fi 7; the gaming-oriented performance flagship.', 'Wi-Fi 7；面向游戏的性能旗舰。'),
  P('xiaomi-redmi-note-15-pro-plus', 'xiaomi', 'Redmi Note 15 Pro+', '2025-08', 'he', false, ['video'],
    'Wi-Fi 6 (802.11ax), 2×2, up to 2.8 Gbps.', 'Wi-Fi 6（802.11ax），2×2，最高 2.8 Gbps。'),
  // Honor
  P('honor-magic8-pro', 'honor', 'Honor Magic8 Pro', '2025-10', 'eht', true, ['browsing', 'voice'],
    'Wi-Fi 7, 2×2; Snapdragon 8 Elite Gen 5.', 'Wi-Fi 7，2×2；骁龙 8 Elite Gen 5。'),
  P('honor-magic-v6', 'honor', 'Honor Magic V6', '2026-03', 'eht', true, ['video'],
    'Foldable; Wi-Fi 7 (802.11be), 2×2.', '折叠屏；Wi-Fi 7（802.11be），2×2。'),
  P('honor-500', 'honor', 'Honor 500', '2025-11', 'eht', true, ['browsing'],
    'Wi-Fi 7; Snapdragon 8s Gen 4, 8000 mAh.', 'Wi-Fi 7；骁龙 8s Gen 4，8000 mAh。'),
  P('honor-x9d', 'honor', 'Honor X9d', '2025-09', 'he', false, ['browsing'],
    'Wi-Fi 6 (802.11ax), dual-band; rugged mid-ranger.', 'Wi-Fi 6（802.11ax），双频；耐用中端机。'),
  // Apple — N1 chip: Wi-Fi 7 at 160 MHz (no 320 MHz), 2×2, MLO on non-China units
  P('apple-iphone-17-pro', 'apple', 'iPhone 17 Pro', '2025-09', 'eht', true, ['video', 'voice'],
    'Apple N1: Wi-Fi 7, 2×2, 160 MHz max; China unit (A3524) without 6 GHz.', '苹果 N1：Wi-Fi 7，2×2，最大 160 MHz；国行（A3524）无 6 GHz。'),
  P('apple-iphone-air', 'apple', 'iPhone Air', '2025-09', 'eht', true, ['browsing'],
    'Apple N1: Wi-Fi 7, 2×2, 160 MHz max.', '苹果 N1：Wi-Fi 7，2×2，最大 160 MHz。'),
  P('apple-iphone-17', 'apple', 'iPhone 17', '2025-09', 'eht', true, ['gaming'],
    'Apple N1: Wi-Fi 7, 2×2, 160 MHz max.', '苹果 N1：Wi-Fi 7，2×2，最大 160 MHz。'),
  P('apple-iphone-16e', 'apple', 'iPhone 16e', '2025-02', 'he', false, ['voice'],
    'Wi-Fi 6 (802.11ax), 2×2.', 'Wi-Fi 6（802.11ax），2×2。'),
]

/** A phone is a 2×2 handset radio: modest power. */
const PHONE_TX_POWER_DBM = 15

function capsFor(p: StationPreset): NodeCfg['caps'] {
  const features = defaultFeatures(p.generation) as Record<string, boolean>
  if (p.generation === 'eht') features.mlo = false // Chinese market: no 6 GHz
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
