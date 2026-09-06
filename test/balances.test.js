const test = require("node:test");
const assert = require("node:assert/strict");
const { simplifyDebts } = require("../src/lib/balances");

function applySettlements(balances, settlements) {
  const byId = new Map(balances.map((b) => [b.person_id, b.net_cents]));
  for (const s of settlements) {
    byId.set(s.from_person_id, byId.get(s.from_person_id) + s.amount_cents);
    byId.set(s.to_person_id, byId.get(s.to_person_id) - s.amount_cents);
  }
  return byId;
}

test("two people: simple debt collapses to one payment", () => {
  const balances = [
    { person_id: "A", net_cents: -1000 },
    { person_id: "B", net_cents: 1000 },
  ];
  const settlements = simplifyDebts(balances);
  assert.equal(settlements.length, 1);
  assert.deepEqual(settlements[0], { from_person_id: "A", to_person_id: "B", amount_cents: 1000 });
});

test("everyone already at zero produces no settlements", () => {
  const balances = [
    { person_id: "A", net_cents: 0 },
    { person_id: "B", net_cents: 0 },
  ];
  assert.deepEqual(simplifyDebts(balances), []);
});

test("one debtor, two creditors: splits across both", () => {
  const balances = [
    { person_id: "A", net_cents: 30_00 },
    { person_id: "B", net_cents: 20_00 },
    { person_id: "C", net_cents: -50_00 },
  ];
  const settlements = simplifyDebts(balances);
  assert.equal(settlements.length, 2);
  assert.ok(settlements.every((s) => s.from_person_id === "C"));
  const totalToA = settlements.find((s) => s.to_person_id === "A").amount_cents;
  const totalToB = settlements.find((s) => s.to_person_id === "B").amount_cents;
  assert.equal(totalToA, 30_00);
  assert.equal(totalToB, 20_00);
});

test("a chain (A owes B, B owes C) collapses to a single direct payment", () => {
  // Net effect of "A owes B $10, B owes C $10": A is down 10, C is up 10, B nets zero.
  const balances = [
    { person_id: "A", net_cents: -10_00 },
    { person_id: "B", net_cents: 0 },
    { person_id: "C", net_cents: 10_00 },
  ];
  const settlements = simplifyDebts(balances);
  assert.equal(settlements.length, 1);
  assert.deepEqual(settlements[0], { from_person_id: "A", to_person_id: "C", amount_cents: 1000 });
});

test("settlement count never exceeds n-1 for n people with nonzero balance", () => {
  const balances = [
    { person_id: "A", net_cents: 733 },
    { person_id: "B", net_cents: -412 },
    { person_id: "C", net_cents: 158 },
    { person_id: "D", net_cents: -901 },
    { person_id: "E", net_cents: 422 },
  ];
  assert.equal(
    balances.reduce((s, b) => s + b.net_cents, 0),
    0,
    "test fixture should itself sum to zero"
  );
  const settlements = simplifyDebts(balances);
  assert.ok(settlements.length <= balances.length - 1);
});

test("applying the settlements always zeroes out every balance", () => {
  const balances = [
    { person_id: "A", net_cents: 733 },
    { person_id: "B", net_cents: -412 },
    { person_id: "C", net_cents: 158 },
    { person_id: "D", net_cents: -901 },
    { person_id: "E", net_cents: 422 },
  ];
  const settlements = simplifyDebts(balances);
  const result = applySettlements(balances, settlements);
  for (const [personId, net] of result) {
    assert.equal(net, 0, `${personId} should net to zero after settling`);
  }
});

test("odd-cent leftover from a split still fully reconciles", () => {
  // e.g. $10.01 split three ways: 334/334/333 - one debtor combo owing to one creditor
  const balances = [
    { person_id: "A", net_cents: 667 },
    { person_id: "B", net_cents: -334 },
    { person_id: "C", net_cents: -333 },
  ];
  const settlements = simplifyDebts(balances);
  const result = applySettlements(balances, settlements);
  for (const [, net] of result) assert.equal(net, 0);
});
