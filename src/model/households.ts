/**
 * Ready-made household scenarios for the editor's 🏠 menu: real phones from
 * the presets, cloud servers with WAN round trips, and a floor plan. Each is a
 * factory so the editor always gets a fresh, unshared object.
 */
import { defaultFeatures } from './caps'
import { STATION_PRESETS, presetNode } from './presets'
import { DEFAULT_SERVERS, type NodeCfg, type ProfileId, type Room, type Scenario, type ServerCfg, type Wall } from './scenario'
import type { Generation } from './types'

export interface Household {
  id: string
  title: { en: string; zh: string }
  blurb: { en: string; zh: string }
  scenario: () => Scenario
}

// ---------------------------------------------------------------------------
// floor plans
// ---------------------------------------------------------------------------

const brick = (x1: number, y1: number, x2: number, y2: number): Wall => ({ x1, y1, x2, y2, material: 'brick', openings: [] })
const drywall = (x1: number, y1: number, x2: number, y2: number, door: number): Wall =>
  ({ x1, y1, x2, y2, material: 'drywall', openings: [{ from: door, to: door + 0.9 }] })

/** 10×8 m: living room (left, 6×8) and bedroom (right, 4×8). */
function twoRooms(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Living room' },
      { x: 6, y: 0, w: 4, h: 8, name: 'Bedroom' },
    ],
    walls: [brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0), drywall(6, 0, 6, 8, 3.5)],
  }
}

/** 12×8 m: living room (6×8), bedroom (3×8) and study (3×8), drywall between. */
function threeRooms(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Living room' },
      { x: 6, y: 0, w: 3, h: 8, name: 'Bedroom' },
      { x: 9, y: 0, w: 3, h: 8, name: 'Study' },
    ],
    walls: [
      brick(0, 0, 12, 0), brick(12, 0, 12, 8), brick(12, 8, 0, 8), brick(0, 8, 0, 0),
      drywall(6, 0, 6, 8, 3.5), drywall(9, 0, 9, 8, 1.0),
    ],
  }
}

// ---------------------------------------------------------------------------
// node helpers
// ---------------------------------------------------------------------------

function ap(x: number, y: number): NodeCfg {
  return {
    id: 'ap', kind: 'ap', name: 'AP (Wi-Fi 7)', pos: { x, y, z: 2.0 }, txPowerDbm: 20, profiles: ['idle'],
    caps: { generation: 'eht', features: defaultFeatures('eht') as Record<string, boolean> },
  }
}

function device(id: string, name: string, x: number, y: number, gen: Generation, profiles: ProfileId[], z = 1.0): NodeCfg {
  return {
    id, kind: 'sta', name, pos: { x, y, z }, txPowerDbm: 15, profiles,
    caps: { generation: gen, features: defaultFeatures(gen) as Record<string, boolean> },
  }
}

/** A phone from the presets, with the household's own traffic mix and server bindings. */
function phone(presetId: string, id: string, x: number, y: number, profiles?: ProfileId[], servers?: NodeCfg['servers']): NodeCfg {
  const p = STATION_PRESETS.find((s) => s.id === presetId)
  if (!p) throw new Error(`no preset ${presetId}`)
  const n = presetNode(p, id, { x, y, z: 1.0 })
  if (profiles) n.profiles = profiles
  if (servers) n.servers = servers
  return n
}

const servers = (...extra: ServerCfg[]): ServerCfg[] => [...DEFAULT_SERVERS.map((s) => ({ ...s })), ...extra]

function sc(house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[], srv: ServerCfg[] = servers(), seed = 11): Scenario {
  return { ...house, nodes, servers: srv, seed, rtsThresholdBytes: 3000, snapshotIntervalMs: 10 }
}

// ---------------------------------------------------------------------------
// the households
// ---------------------------------------------------------------------------

export const HOUSEHOLDS: Household[] = [
  {
    id: 'three-gamers',
    title: { en: 'Three gamers, one match', zh: '三人开黑' },
    blurb: {
      en: 'A Huawei Mate 80 Pro, a Xiaomi 17 Pro Max and an iPhone 17 play the same game on one server while the TV streams. Compare their pings, then turn on the router’s game acceleration.',
      zh: '华为 Mate 80 Pro、小米 17 Pro Max 和 iPhone 17 在同一台游戏服务器上开黑，电视同时在播视频。比较三部手机的 ping，再打开路由器的游戏加速。',
    },
    scenario: () => sc(twoRooms(), [
      ap(3, 4),
      phone('huawei-mate-80-pro', 'sta-1', 1.5, 2, ['gaming']),
      phone('xiaomi-17-pro-max', 'sta-2', 2.5, 6.5, ['gaming']),
      phone('apple-iphone-17', 'sta-3', 8, 2, ['gaming']),
      device('sta-4', 'TV (Wi-Fi 6)', 5, 7, 'he', ['video']),
    ]),
  },
  {
    id: 'two-gamers',
    title: { en: 'Two gamers, two servers', zh: '两名玩家，两台服务器' },
    blurb: {
      en: 'An iPhone 17 on the 25 ms domestic game server, a Redmi K90 Pro Max on an 80 ms overseas one with 20 ms of jitter. The Wi-Fi is the same; the WAN is not.',
      zh: 'iPhone 17 连接 25 ms 的国内游戏服务器，Redmi K90 Pro Max 连接 80 ms、抖动 20 ms 的海外服务器。Wi-Fi 相同，广域网不同。',
    },
    scenario: () => sc(twoRooms(), [
      ap(3, 4),
      phone('apple-iphone-17', 'sta-1', 1.5, 2, ['gaming']),
      phone('xiaomi-redmi-k90-pro-max', 'sta-2', 8, 6, ['gaming'], { gaming: 'srv-game-overseas' }),
    ], servers({ id: 'srv-game-overseas', kind: 'game', name: 'Overseas game server', rttMs: 80, jitterMs: 20, processMs: 2 })),
  },
  {
    id: 'movie-night',
    title: { en: 'Movie night', zh: '电影之夜' },
    blurb: {
      en: 'The TV streams a film, two phones browse on the sofa, and someone in the bedroom is on a call. Voice should win every contention.',
      zh: '电视在播电影，沙发上两部手机在刷网页，卧室里有人在通话。语音应当赢得每一次竞争。',
    },
    scenario: () => sc(twoRooms(), [
      ap(3, 4),
      device('sta-1', 'TV (Wi-Fi 6)', 5, 7, 'he', ['video']),
      phone('honor-magic8-pro', 'sta-2', 2, 6, ['browsing']),
      phone('xiaomi-redmi-note-15-pro-plus', 'sta-3', 3.5, 6, ['browsing']),
      phone('apple-iphone-16e', 'sta-4', 8.5, 2, ['voice']),
    ]),
  },
  {
    id: 'work-from-home',
    title: { en: 'Working from home', zh: '居家办公' },
    blurb: {
      en: 'A laptop in the study on a video call (voice up, video down) while a NAS backup runs in the living room and a phone browses.',
      zh: '书房的笔记本在开视频会议（语音上行、视频下行），客厅里 NAS 在做备份，一部手机在刷网页。',
    },
    scenario: () => sc(threeRooms(), [
      ap(4, 4),
      device('sta-1', 'Laptop (Wi-Fi 7)', 10.5, 4, 'eht', ['voice', 'video']),
      device('sta-2', 'NAS (Wi-Fi 5)', 1, 1, 'vht', ['backup']),
      phone('huawei-pura-80-ultra', 'sta-3', 7.5, 6, ['browsing']),
    ]),
  },
  {
    id: 'smart-home',
    title: { en: 'Smart home', zh: '智能家居' },
    blurb: {
      en: 'Six legacy IoT sensors scattered through the flat, a phone and a TV. Watch how much airtime a 100-byte reading at 6 Mb/s costs.',
      zh: '六个传统 IoT 传感器散布在各个房间，加一部手机和一台电视。看看 6 Mb/s 下一条 100 字节的读数要占多少空口时间。',
    },
    scenario: () => sc(threeRooms(), [
      ap(4, 4),
      device('sta-1', 'TV (Wi-Fi 6)', 5, 7, 'he', ['video']),
      phone('honor-500', 'sta-2', 2, 2, ['browsing', 'voice']),
      device('sta-3', 'Door sensor', 0.5, 0.5, 'nonht', ['iot']),
      device('sta-4', 'Thermostat', 7.5, 1, 'nonht', ['iot'], 1.5),
      device('sta-5', 'Smart plug', 11.5, 7.5, 'nonht', ['iot'], 0.3),
      device('sta-6', 'Air monitor', 10.5, 1, 'nonht', ['iot'], 1.2),
      device('sta-7', 'Window sensor', 6.5, 7.5, 'nonht', ['iot'], 1.8),
      device('sta-8', 'Camera', 0.5, 7.5, 'nonht', ['iot'], 2.2),
    ]),
  },
  {
    id: 'full-house',
    title: { en: 'Full house', zh: '满屋子人' },
    blurb: {
      en: 'Three rooms, six phones from every brand, a TV and a sensor: gaming, calls, browsing and video at once. The capstone with real phones.',
      zh: '三个房间、六部各品牌手机、一台电视和一个传感器：游戏、通话、网页和视频同时进行。用真实机型重演结业课。',
    },
    scenario: () => sc(threeRooms(), [
      ap(4, 4),
      phone('huawei-mate-80-pro', 'sta-1', 1.5, 2, ['gaming']),
      phone('xiaomi-17-ultra', 'sta-2', 2.5, 6.5, ['video', 'gaming']),
      phone('honor-magic-v6', 'sta-3', 7.5, 2, ['video']),
      phone('apple-iphone-17-pro', 'sta-4', 7.5, 6, ['voice']),
      phone('honor-x9d', 'sta-5', 10.5, 2, ['browsing']),
      phone('huawei-mate-60-pro', 'sta-6', 10.5, 6, ['browsing', 'voice']),
      device('sta-7', 'TV (Wi-Fi 6)', 5, 7, 'he', ['video']),
      device('sta-8', 'Sensor (legacy)', 0.5, 7.5, 'nonht', ['iot']),
    ]),
  },
]
