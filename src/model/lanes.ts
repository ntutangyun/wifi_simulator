/**
 * Timeline lanes: one row per radio the scenario runs. The Wi-Fi rows are the
 * link plan's virtual ids (a node with two links owns two of them); every UWB
 * node adds one row of its own, keyed by its plain node id.
 */
import { linkPlanFor } from './caps'
import type { NodeCfg } from './scenario'

export function laneIds(nodes: NodeCfg[]): string[] {
  const uwb = nodes.filter((n) => n.kind === 'uwb').map((n) => n.id)
  return [...linkPlanFor(nodes).virtualIds, ...uwb]
}
