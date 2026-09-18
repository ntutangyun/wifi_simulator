import { BAND_LABEL, linkOfVirtual, physicalId } from '../model/caps'
import type { NodeCfg } from '../model/scenario'

/**
 * The name a learner sees for a node id: the scenario's display name (“Laptop
 * (MLO)”), with the band appended for a non-5-GHz lane, and a plain-language
 * word for the multi-user / broadcast wildcards. Engine ids like “sta-1” never
 * reach the screen — a learner cannot map them to the devices in the 3D view.
 */
export function nodeDisplayName(nodes: NodeCfg[], id: string, everyone: string): string {
  if (id === '*mu' || id === '*') return everyone
  const cfg = nodes.find((n) => n.id === physicalId(id))
  const name = cfg?.name ?? id
  // A UWB device holds a lane of its own, keyed by its plain node id: it runs
  // no Wi-Fi link, so a band suffix would be a lie ('#' can never appear in it).
  if (cfg?.kind === 'uwb') return name
  const link = linkOfVirtual(id)
  return link === '5g' ? name : `${name} · ${BAND_LABEL[link]}`
}
