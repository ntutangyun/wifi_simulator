import { physicalId } from '../model/caps'
import type { NodeCfg } from '../model/scenario'

/**
 * The name a learner sees for a node id: the scenario's display name (“Laptop
 * (MLO)”), with the band appended for a 6 GHz MLO link, and a plain-language
 * word for the multi-user / broadcast wildcards. Engine ids like “sta-1” never
 * reach the screen — a learner cannot map them to the devices in the 3D view.
 */
export function nodeDisplayName(nodes: NodeCfg[], id: string, everyone: string): string {
  if (id === '*mu' || id === '*') return everyone
  const cfg = nodes.find((n) => n.id === physicalId(id))
  const name = cfg?.name ?? id
  return id.includes('#6g') ? `${name} · 6G` : name
}
