const db = require("../db");

/**
 * Computes each group member's net balance in cents.
 * Positive = net creditor (the group owes them). Negative = net debtor (they owe the group).
 * Returns a Map<person_id, number>, seeded with 0 for every current member so
 * someone with no expenses yet still shows up at zero.
 */
function computeGroupBalances(groupId) {
  const balances = new Map();
  for (const { person_id } of db.prepare("SELECT person_id FROM group_members WHERE group_id = ?").all(groupId)) {
    balances.set(person_id, 0);
  }

  const bump = (personId, delta) => {
    balances.set(personId, (balances.get(personId) || 0) + delta);
  };

  const expenses = db
    .prepare("SELECT id, paid_by, amount_cents FROM expenses WHERE group_id = ? AND deleted_at IS NULL")
    .all(groupId);
  const splitStmt = db.prepare("SELECT person_id, share_cents FROM expense_splits WHERE expense_id = ?");
  for (const exp of expenses) {
    bump(exp.paid_by, exp.amount_cents);
    for (const split of splitStmt.all(exp.id)) {
      bump(split.person_id, -split.share_cents);
    }
  }

  const payments = db
    .prepare("SELECT from_person, to_person, amount_cents FROM payments WHERE group_id = ? AND deleted_at IS NULL")
    .all(groupId);
  for (const pmt of payments) {
    bump(pmt.from_person, pmt.amount_cents);
    bump(pmt.to_person, -pmt.amount_cents);
  }

  return balances;
}

/**
 * Greedily matches the largest creditor against the largest debtor, repeatedly,
 * to collapse a set of net balances into the minimum practical number of payments.
 * balances: [{person_id, net_cents}]
 * Returns: [{from_person_id, to_person_id, amount_cents}]
 */
function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  for (const b of balances) {
    if (b.net_cents > 0) creditors.push({ person_id: b.person_id, amount: b.net_cents });
    else if (b.net_cents < 0) debtors.push({ person_id: b.person_id, amount: -b.net_cents });
  }

  const settlements = [];
  let ci = 0;
  let di = 0;
  // Sort descending so each step matches the biggest creditor with the biggest debtor.
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      settlements.push({ from_person_id: debtor.person_id, to_person_id: creditor.person_id, amount_cents: amount });
      creditor.amount -= amount;
      debtor.amount -= amount;
    }

    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return settlements;
}

module.exports = { computeGroupBalances, simplifyDebts };
