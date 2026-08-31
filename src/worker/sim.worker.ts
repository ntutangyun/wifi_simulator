/// <reference lib="webworker" />
import { Simulation } from '../engine/simulation'
import type { FromWorker, ToWorker } from './protocol'

const CHUNK_NS = 50_000_000 // simulate in 50 ms sim-time chunks

let sim: Simulation | null = null
let simulatedTo = 0
let targetNs = 0
let running = false

const post = (m: FromWorker) => (self as unknown as Worker).postMessage(m)

function pump(): void {
  if (running || !sim) return
  running = true
  const step = () => {
    if (!sim || simulatedTo >= targetNs) {
      running = false
      return
    }
    const next = Math.min(simulatedTo + CHUNK_NS, targetNs)
    try {
      const batch = sim.runUntil(next)
      simulatedTo = next
      post({ type: 'batch', batch })
    } catch (e) {
      post({ type: 'error', message: e instanceof Error ? `${e.message}\n${e.stack}` : String(e) })
      running = false
      sim = null
      return
    }
    // Yield between chunks so new messages (higher targets, dispose) are handled.
    setTimeout(step, 0)
  }
  step()
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data
  switch (m.type) {
    case 'init':
      try {
        sim = new Simulation(m.scenario)
        simulatedTo = 0
        targetNs = 0
      } catch (e) {
        post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
      }
      break
    case 'run':
      targetNs = Math.max(targetNs, m.untilNs)
      pump()
      break
    case 'dispose':
      sim = null
      self.close()
      break
  }
}
