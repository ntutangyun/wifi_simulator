# Cloud servers and household scenarios — design

Date: 2026-09-08. Status: approved in chat, building directly (no separate plan review).

## Goal

Give every stream an endpoint beyond the AP — a YouTube server, a web server, a
call server, a game server — with a WAN round-trip time, so the simulator can
report a true application round trip per station (Wi-Fi uplink + WAN + server +
Wi-Fi downlink) next to the Wi-Fi-only latency it already shows. Ship a menu of
ready-made household scenarios built from the phone presets, including one
where three phones (a Huawei among them) play on the same game server.

## Non-goals

Wired-side queueing, server load, DNS, TCP. A server is an endpoint with a
fixed one-way delay of half its RTT in each direction.

## Model

```ts
type ServerKind = 'video' | 'web' | 'call' | 'game'
interface ServerCfg { id: string; kind: ServerKind; name: string; rttMs: number }
Scenario.servers: ServerCfg[]                 // schema backfills DEFAULT_SERVERS when absent
NodeCfg.servers?: Partial<Record<ProfileId, string>>   // stream → server id (explicit binding)
```

Default servers: YouTube (video, 20 ms), Google (web, 12 ms), Call server
(call, 40 ms), Game server (game, 25 ms). Profile → server kind: video→video,
browsing/backup/iot→web, voice→call, gaming→game, saturated→none. A stream's
server is its explicit binding, else the first server of its kind, else none
(then no WAN delay and no server events — this is how course lessons run:
their scenarios carry `servers: []`, so every lesson timeline is unchanged).

The schema rejects a binding to a server id that does not exist and duplicate
server ids.

## Engine

`TrafficSource` gains `server: { id, wanNs } | null` and an emit callback for
WAN records. Downlink emission goes through the server: at send time it emits
`WAN_TX` and schedules the AP `ENQUEUE` `wanNs` later (the MSDU's `bornNs` is
its arrival at the AP, so Wi-Fi latency stays what it is). Uplink delivery is
reported by `Simulation` from the station MAC's `onDequeue(msduId)` hook to the
owning source, which schedules `WAN_RX` at `t + wanNs` and reacts per profile:

| profile  | server reaction to an uplink arrival |
|----------|--------------------------------------|
| gaming   | consumes the input; the server's own 60 Hz state updates flow regardless |
| voice    | echoes a 200 B packet (the far end's voice) |
| browsing | sends the 20–80 frame page burst after a 10 ms think time |
| video    | — (server streams on its own clock, delayed by WAN) |
| backup, iot | — (arrival only) |

Voice downlink therefore becomes reply-driven instead of an independent 20 ms
clock; gaming downlink stays an independent 60 Hz server clock.

**RTT is measured by pings, not by the app's replies** (revised after review:
a game's ping counter shows the network round trip, not the wait for the next
server tick). Every server-bound stream sends a 64 B ping every 250 ms on its
own access category; the server echoes it at once, and the echo's `ENQUEUE`
carries `rttFromNs` = the ping's birth. RTT = Wi-Fi up + WAN + Wi-Fi down.
Page loads, voice echoes and game state updates carry no stamp.

**Real servers (revision 2).** `ServerCfg` gains `jitterMs` and `processMs`
(schema default 0 for old saves). Each WAN crossing takes `rttMs/2` plus a
uniform draw from `[0, jitterMs/2]`, so a packet's round trip lies in
`[rttMs, rttMs + jitterMs]`. The server answers a request or echoes a ping
`processMs` after the arrival; the browsing page's think time is that value.
Defaults: YouTube 20+2 ms / 1 ms, Google 12+2 / 5, call 40+5 / 1, game 25+3 / 2;
the overseas game server 80+20 / 2.

**Router game acceleration.** `NodeCfg.gameAccel` on the AP (default off).
Off: game packets are unmarked and queue in AC_BE, the real-world default.
On: the router marks game flows into AC_VI, as home routers' gaming modes do.
The traffic source's `ac` for `gaming` follows the switch.

## Records and view

New records: `WAN_TX { server, msduId, bytes, to, arriveNs }` and
`WAN_RX { server, msduId, bytes, from, sentNs }`. `ENQUEUE` gains optional
`server` and `rttFromNs`. The view keeps `vs.wan` flights (for the scene) and
per-server byte counters; a queue entry carries `rttFromNs`, and on `DEQUEUE`
of such an entry the destination station's `stats.appRtt` accumulates
`t − rttFromNs` with the server id recorded.

## UI

- Inspector node section: "RTT (ping)" row (mean / max, server name). Totals
  table: an "RTT (ping)" column. AP properties: the 🎮 game acceleration box.
- 3D labels: a smaller second line under a station's name lists its apps
  ("🎮 game · 📺 video"), localized; the AP and idle stations show none.
- A servers list under the totals: name, kind, RTT, bytes up / down.
- 3D scene: one cloud per server on a strip beyond the house's north wall, a
  faint line to the AP, and a small dot travelling the line for every WAN
  flight.
- Editor: Servers section in Objects (name, kind, RTT; add / delete), a server
  picker beside every ticked stream that has a server kind, and a
  "🏠 Households" menu loading a ready-made scenario.

## Households (`src/model/households.ts`)

1. Three gamers, one match — Mate 80 Pro, Xiaomi 17 Pro Max, iPhone 17 on one
   game server; TV streaming.
2. Two gamers, two servers — iPhone 17 on 25 ms, Redmi K90 Pro Max on an 80 ms
   overseas server.
3. Movie night — TV video, two phones browsing, one on a call.
4. Working from home — laptop on a call + video, phone browsing, backup running.
5. Smart home — six IoT sensors, one phone, one TV.
6. Full house — three rooms, six preset phones, TV and sensor.

Each has a bilingual title and blurb and a `scenario()` factory.

## Tests

Schema round trip with servers; backfill for JSON without the field; unknown
binding rejected. `serverFor` resolution. Traffic: WAN delay on downlink;
browsing burst and voice echo only after the uplink arrival; pings every
250 ms and their echoes carry the RTT stamp; gaming is AC_BE unless the AP's
game acceleration is on. View: hand-built ENQUEUE/DEQUEUE yields
the app RTT on the client; WAN records become flights. Households: each
validates and simulates 100 ms; the three-gamer one has three gaming phones,
one Huawei, one shared game server, and every phone gets an app RTT above the
WAN RTT. All existing lesson tests unchanged.
