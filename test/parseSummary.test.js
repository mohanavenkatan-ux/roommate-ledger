const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCostcoSplitSummary } = require("../public/parseSummary.js");

test("parses a real Costco Split summary captured from a live run", () => {
  // Captured verbatim from an actual browser session where only one $21.99
  // item (of a larger receipt) had been assigned to these three people.
  // Costco Split's "Total:" line is always the whole receipt's total, not
  // the sum of only-assigned items - so it legitimately does NOT equal the
  // sum of the people below. Importers must use the people-sum as the
  // actual expense amount, and treat total_cents as an informational
  // cross-check (e.g. to warn "only part of this receipt was assigned").
  const text = [
    "Sample Warehouse #101 · Jan 15, 2026",
    "Total: $152.82",
    "",
    "Ananya: $7.33",
    "Rahul: $7.33",
    "Priya: $7.33",
    "",
    "Paid by Ananya - settle up:",
    "Rahul owes Ananya $7.33",
    "Priya owes Ananya $7.33",
  ].join("\n");

  const result = parseCostcoSplitSummary(text);
  assert.equal(result.description, "Sample Warehouse #101 · Jan 15, 2026");
  assert.equal(result.total_cents, 15282);
  assert.equal(result.currency_symbol, "$");
  assert.equal(result.payerName, "Ananya");
  assert.deepEqual(result.people, [
    { name: "Ananya", amount_cents: 733 },
    { name: "Rahul", amount_cents: 733 },
    { name: "Priya", amount_cents: 733 },
  ]);
  const sum = result.people.reduce((s, p) => s + p.amount_cents, 0);
  assert.equal(sum, 2199);
  assert.notEqual(sum, result.total_cents, "this fixture is a deliberately partial split");
});

test("when every item is assigned, the people sum matches the total", () => {
  const text = ["Receipt", "Total: $30.00", "", "M: $15.00", "R: $15.00", "", "Paid by M - settle up:", "R owes M $15.00"].join("\n");
  const result = parseCostcoSplitSummary(text);
  const sum = result.people.reduce((s, p) => s + p.amount_cents, 0);
  assert.equal(sum, result.total_cents);
});

test("parses the 'nobody owes' form and still identifies the payer", () => {
  const text = ["Receipt", "Total: $20.00", "", "M: $20.00", "", "Nobody owes M anything."].join("\n");
  const result = parseCostcoSplitSummary(text);
  assert.equal(result.payerName, "M");
  assert.equal(result.total_cents, 2000);
});

test("parses a summary with no payer selected at all", () => {
  const text = ["Receipt", "Total: $20.00", "", "M: $10.00", "R: $10.00"].join("\n");
  const result = parseCostcoSplitSummary(text);
  assert.equal(result.payerName, null);
  assert.equal(result.people.length, 2);
});

test("handles a non-dollar currency symbol", () => {
  const text = ["Receipt", "Total: €20.00", "", "M: €20.00"].join("\n");
  const result = parseCostcoSplitSummary(text);
  assert.equal(result.currency_symbol, "€");
  assert.equal(result.total_cents, 2000);
});

test("rejects text that isn't a summary", () => {
  assert.throws(() => parseCostcoSplitSummary("just some random text"));
});

test("rejects a summary missing the Total line", () => {
  const text = ["Receipt", "not a total line", "", "M: $10.00"].join("\n");
  assert.throws(() => parseCostcoSplitSummary(text));
});

test("is tolerant of leading/trailing blank lines from a sloppy paste", () => {
  const text = "\n\n" + ["Receipt", "Total: $10.00", "", "M: $10.00"].join("\n") + "\n\n";
  const result = parseCostcoSplitSummary(text);
  assert.equal(result.total_cents, 1000);
});
