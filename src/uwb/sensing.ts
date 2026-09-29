/**
 * The consumer of an echo — the one thing in this engine that reads one, and the whole of what
 * "sensing" means here: a receiver handed a second arrival writes down what it implies.
 *
 * **Why a wrapper rather than a method on `UwbDevice`.** `UwbRadio.onEcho` is optional, and
 * `UwbDevice` deliberately implements none of it (sensing design §3): a 4z/4ab ranging receiver
 * locks the first path and suppresses whatever follows, so the receive timestamp, `acquired` and
 * the fragment train must see exactly the arrivals they always saw. Putting `onEcho` on the
 * device would have made that guarantee a promise about the body of a method instead of a fact
 * about the object graph. So the sensor is a **decorator**: it forwards every ranging call
 * straight through to the device and adds the one door an echo comes through, and
 * `src/uwb/network.ts` registers it **only when the scenario has the scatterers section at
 * all**. A session that names no reflecting objects therefore has no sensing consumer in it —
 * `onEcho?.()` at the medium finds nothing to call — and cannot emit a record of this kind even
 * in principle.
 *
 * **It measures nothing.** Every number in the record was computed by `src/engine/scatter.ts`
 * when the medium laid the echo down; this class converts the resolution from nanoseconds to
 * metres and emits. That is on purpose: a consumer that re-derived the geometry could disagree
 * with the arrival it is describing, and two answers to one question is how a timeline starts
 * depending on call order.
 *
 * **What it cannot record.** That an echo arrived but was too weak. The medium gates an echo on
 * the *direct path's own* sensitivity (`UwbChannel.deliverEcho`), and this engine has no
 * separate sensing floor — inventing one would be inventing a number. So a faint echo is never
 * handed over and nothing says it was there. A lesson's `limits` is where that belongs.
 *
 * **Bistatic only.** The medium skips `rxId === from`, so no device hears its own reflection.
 * There is no monostatic radar here, and a lesson should say so rather than let a reader assume
 * a tag can sense on its own.
 */
import type { FrameDesc } from '../model/frames'
import type { EmitFn, RxFailReason } from '../model/records'
import type { Ns } from '../model/types'
import type { EchoInfo, UwbRadio, UwbRxInfo } from './channel'
import { C_M_PER_NS } from './phy'

/**
 * A radio with sensing bolted on: `radio` does the ranging, this object records the echoes.
 *
 * Only `onEcho` is this class's own. The four `UwbRadio` members below are pure forwarding and
 * must stay that way — the medium calls them on whatever was registered, so a line of logic
 * added here would be a line of logic added to ranging in every scene with a wardrobe in it.
 */
export class UwbSensor implements UwbRadio {
  constructor(
    /** The receiver this sensor sits at: the `node` of every record it writes. */
    private readonly id: string,
    /** The ranging radio underneath, which never learns that any of this happened. */
    private readonly radio: UwbRadio,
    private readonly now: () => Ns,
    private readonly emit: EmitFn,
  ) {}

  listening(): boolean {
    return this.radio.listening()
  }

  onRxStart(from: string, frame: FrameDesc): void {
    this.radio.onRxStart(from, frame)
  }

  onRxOk(from: string, frame: FrameDesc, info: UwbRxInfo): void {
    this.radio.onRxOk(from, frame, info)
  }

  onRxFail(from: string, reason: RxFailReason): void {
    this.radio.onRxFail(from, reason)
  }

  /**
   * One echo, one record (`UWB_ECHO`).
   *
   * `resolutionM` is the echo's own `resolutionNs` in metres — `c × 1/B`, 0.60 m for the HRP UWB
   * PHY and some 120 m for a 2.5 MHz narrowband message. It travels beside `excessM` so the
   * record carries the comparison the verdict was taken on, not only the verdict: an object
   * hugging the line between the two ends shows up as a few centimetres of excess and a
   * `resolvable: false`, which is the fact about real equipment design §4 is built on.
   */
  onEcho(from: string, _frame: FrameDesc, echo: EchoInfo): void {
    this.emit({
      t: this.now(),
      type: 'UWB_ECHO',
      node: this.id,
      from,
      scattererId: echo.scattererId,
      pathM: echo.pathM,
      propNs: echo.propNs,
      excessM: echo.excessM,
      resolutionM: C_M_PER_NS * echo.resolutionNs,
      rssiDbm: echo.rssiDbm,
      resolvable: echo.resolvable,
    })
  }
}
