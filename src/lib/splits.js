// Distributes totalCents proportionally to weights, rounding to the cent so
// the shares always sum to exactly totalCents (largest-remainder method).
function distributeProportional(totalCents, weightEntries) {
  const totalWeight = weightEntries.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) throw new Error("Total weight must be positive");

  const raw = weightEntries.map((w) => {
    const exact = (totalCents * w.weight) / totalWeight;
    const floor = Math.floor(exact);
    return { person_id: w.person_id, floor, frac: exact - floor };
  });

  const assigned = raw.reduce((s, r) => s + r.floor, 0);
  const remainder = totalCents - assigned;
  const byFracDesc = [...raw].sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remainder; i++) {
    byFracDesc[i % byFracDesc.length].floor += 1;
  }

  return raw.map((r) => ({ person_id: r.person_id, share_cents: r.floor }));
}

/**
 * Resolves a split into per-person cent amounts that always sum exactly to amountCents.
 *
 * participants shape depends on splitType:
 *   equal:      [personId, ...]
 *   shares:     [{person_id, shares}, ...]        shares > 0
 *   percentage: [{person_id, percentage}, ...]     must sum to 100
 *   exact:      [{person_id, amount_cents}, ...]   must sum to amountCents
 */
function resolveSplits(amountCents, splitType, participants) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("amount_cents must be a positive integer");
  }
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error("At least one participant is required");
  }

  if (splitType === "equal") {
    return distributeProportional(
      amountCents,
      participants.map((p) => ({ person_id: p, weight: 1 }))
    );
  }

  if (splitType === "shares") {
    for (const p of participants) {
      if (!(Number(p.shares) > 0)) throw new Error("Each person's shares must be a positive number");
    }
    return distributeProportional(
      amountCents,
      participants.map((p) => ({ person_id: p.person_id, weight: Number(p.shares) }))
    );
  }

  if (splitType === "percentage") {
    const total = participants.reduce((s, p) => s + Number(p.percentage), 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new Error(`Percentages must sum to 100 (got ${total})`);
    }
    return distributeProportional(
      amountCents,
      participants.map((p) => ({ person_id: p.person_id, weight: Number(p.percentage) }))
    );
  }

  if (splitType === "exact") {
    const total = participants.reduce((s, p) => s + Number(p.amount_cents), 0);
    if (total !== amountCents) {
      throw new Error(`Exact amounts must sum to the total (${total} vs ${amountCents})`);
    }
    return participants.map((p) => ({ person_id: p.person_id, share_cents: Number(p.amount_cents) }));
  }

  throw new Error(`Unknown split type: ${splitType}`);
}

module.exports = { resolveSplits, distributeProportional };
