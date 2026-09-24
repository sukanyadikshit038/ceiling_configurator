// One question at a time.
//
// A product panel asks for several answers and some of them only make sense
// once an earlier one exists: a cloud size depends on the shape, because
// triangle has no 600; a tile's perforation depends on the range, because the
// PF codes are Wood Classic's. The panel used to show everything at once and
// let the dependent controls quietly offer nothing, or — in the cloud panel's
// case — hide the Size field until a shape appeared, which made the form grow
// under the cursor.
//
// So: every field is on screen from the start, and a field is LOCKED until
// every required answer above it is given. Nothing appears, nothing moves, and
// what the product is going to ask for is visible before you start.
//
// THE ORDER IS NOT INVENTED HERE. Each product already declares the answers it
// needs, in the order its panel asks them — CLOUD_REQUIRED, TILE_REQUIRED,
// FLY_REQUIRED, and baffles' REQUIRED. Those lists are what `missingFields`
// has always read to write the "still to choose" line, so the staircase and
// that line can never disagree about what is outstanding.
//
// The chains are EFFECTIVE, not static: a tile range with its frame built in is
// never asked for a Grid, and a fabric range is never asked for a Perforation.
// A field can only be gated on a question its own spec actually asks.

/**
 * Build the lock test for one spec.
 *
 * `chain` is that product's effective required list, `[[key, label], ...]`, in
 * panel order.
 *
 * The returned function takes the LAST required key at or above the field in
 * the panel, and answers with the label of the first thing still to be
 * answered — or null when the field is free. So a caller reads as the panel
 * does: "Size waits on shape", "Suspension height waits on colour".
 *
 *   const gate = gateOf(p, cloudRequired(p))
 *   gate('shape')   // -> 'Shape' while no shape is chosen, else null
 *   gate(null)      // -> null; the first field is never locked
 *
 * Returning the LABEL rather than a boolean is deliberate: a locked field can
 * then say which answer it is waiting for, which is the difference between a
 * form that is guiding you and one that is broken.
 */
export function gateOf(params, chain) {
  /** The first unanswered question in chain[0..end), or null. */
  const firstMissing = (end) => {
    for (let i = 0; i < end; i++) {
      const [key, label] = chain[i]
      if (params?.[key] == null) return label
    }
    return null
  }

  const gate = (upTo) => {
    if (!upTo) return null
    const end = chain.findIndex(([k]) => k === upTo)
    // A key that is not in THIS spec's chain is not a question being asked —
    // a tile that carries no perforation cannot be waiting on one — so a field
    // gated on it is free rather than stuck for ever.
    if (end < 0) return null
    return firstMissing(end + 1)
  }

  /**
   * For a field that is ITSELF in the chain: wait on everything above it.
   *
   * Prefer this to naming the key above by hand. `gate('grid')` looks like the
   * same thing and is not: Univic Strip has its frame built in, so Grid drops
   * out of that range's chain, `findIndex` answers -1, and the field below it
   * reads as free with no Size chosen. Asking about the field's OWN position
   * cannot go wrong that way, because a field that is not in the chain is not
   * being asked for at all.
   */
  gate.before = (key) => {
    const at = chain.findIndex(([k]) => k === key)
    return at < 0 ? null : firstMissing(at)
  }

  return gate
}
