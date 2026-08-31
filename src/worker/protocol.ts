import type { Batch } from '../engine/simulation'
import type { Scenario } from '../model/scenario'
import type { Ns } from '../model/types'

export type ToWorker =
  | { type: 'init'; scenario: Scenario }
  | { type: 'run'; untilNs: Ns }
  | { type: 'dispose' }

export type FromWorker =
  | { type: 'batch'; batch: Batch }
  | { type: 'error'; message: string }
