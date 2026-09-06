const express = require("express");
const db = require("../db");
const { newId } = require("../lib/ids");
const { resolveSplits } = require("../lib/splits");

const router = express.Router({ mergeParams: true });

function toCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function memberIds(groupId) {
  return new Set(
    db.prepare("SELECT person_id FROM group_members WHERE group_id = ?").all(groupId).map((r) => r.person_id)
  );
}

function participantPersonIds(splitType, participants) {
  if (splitType === "equal") return participants;
  return participants.map((p) => p.person_id);
}

// POST /api/groups/:groupId/expenses
router.post("/", (req, res) => {
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const { description, amount, paid_by, split_type, participants, category, source } = req.body || {};

  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required" });
  }
  const amountCents = toCents(amount);
  if (amountCents === null || amountCents <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  if (!paid_by || typeof paid_by !== "string") {
    return res.status(400).json({ error: "paid_by is required" });
  }
  if (!["equal", "exact", "percentage", "shares"].includes(split_type)) {
    return res.status(400).json({ error: "split_type must be one of equal, exact, percentage, shares" });
  }

  const members = memberIds(group.id);
  if (!members.has(paid_by)) {
    return res.status(400).json({ error: "paid_by must be a member of this group" });
  }

  let splits;
  try {
    splits = resolveSplits(amountCents, split_type, participants);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const pids = participantPersonIds(split_type, participants);
  for (const pid of pids) {
    if (!members.has(pid)) {
      return res.status(400).json({ error: `Person ${pid} is not a member of this group` });
    }
  }

  const id = newId();
  const insertExpense = db.prepare(
    `INSERT INTO expenses (id, group_id, description, amount_cents, paid_by, split_type, category, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSplit = db.prepare(
    "INSERT INTO expense_splits (expense_id, person_id, share_cents) VALUES (?, ?, ?)"
  );

  db.transaction(() => {
    insertExpense.run(
      id,
      group.id,
      description.trim(),
      amountCents,
      paid_by,
      split_type,
      category && typeof category === "string" ? category : "general",
      source === "costco-split" ? "costco-split" : "manual"
    );
    for (const s of splits) {
      insertSplit.run(id, s.person_id, s.share_cents);
    }
  })();

  res.status(201).json(getExpense(id));
});

function getExpense(id) {
  const expense = db
    .prepare(
      `SELECT id, group_id, description, amount_cents, paid_by, split_type, category, source, created_at
       FROM expenses WHERE id = ? AND deleted_at IS NULL`
    )
    .get(id);
  if (!expense) return null;
  expense.splits = db
    .prepare("SELECT person_id, share_cents FROM expense_splits WHERE expense_id = ?")
    .all(id);
  return expense;
}

// GET /api/groups/:groupId/expenses
router.get("/", (req, res) => {
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const rows = db
    .prepare(
      `SELECT id FROM expenses WHERE group_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
    )
    .all(group.id);
  res.json(rows.map((r) => getExpense(r.id)));
});

// PATCH /api/groups/:groupId/expenses/:expenseId
// Full replace of description/amount/paid_by/split_type/participants/category.
router.patch("/:expenseId", (req, res) => {
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });
  const existing = getExpense(req.params.expenseId);
  if (!existing || existing.group_id !== group.id) {
    return res.status(404).json({ error: "Expense not found" });
  }

  const {
    description = existing.description,
    amount,
    paid_by = existing.paid_by,
    split_type = existing.split_type,
    participants,
    category = existing.category,
  } = req.body || {};

  const amountCents = amount === undefined ? existing.amount_cents : toCents(amount);
  if (amountCents === null || amountCents <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }

  const members = memberIds(group.id);
  if (!members.has(paid_by)) {
    return res.status(400).json({ error: "paid_by must be a member of this group" });
  }

  const effectiveParticipants =
    participants ||
    (split_type === existing.split_type
      ? existing.splits.map((s) =>
          split_type === "equal" ? s.person_id : { person_id: s.person_id, amount_cents: s.share_cents }
        )
      : null);
  if (!effectiveParticipants) {
    return res.status(400).json({ error: "participants is required when changing split_type" });
  }

  let splits;
  try {
    splits = resolveSplits(amountCents, split_type, effectiveParticipants);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const pids = participantPersonIds(split_type, effectiveParticipants);
  for (const pid of pids) {
    if (!members.has(pid)) {
      return res.status(400).json({ error: `Person ${pid} is not a member of this group` });
    }
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE expenses SET description = ?, amount_cents = ?, paid_by = ?, split_type = ?, category = ?
       WHERE id = ?`
    ).run(description.trim(), amountCents, paid_by, split_type, category, existing.id);
    db.prepare("DELETE FROM expense_splits WHERE expense_id = ?").run(existing.id);
    const insertSplit = db.prepare(
      "INSERT INTO expense_splits (expense_id, person_id, share_cents) VALUES (?, ?, ?)"
    );
    for (const s of splits) insertSplit.run(existing.id, s.person_id, s.share_cents);
  })();

  res.json(getExpense(existing.id));
});

// DELETE /api/groups/:groupId/expenses/:expenseId
router.delete("/:expenseId", (req, res) => {
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });
  const existing = db
    .prepare("SELECT id FROM expenses WHERE id = ? AND group_id = ? AND deleted_at IS NULL")
    .get(req.params.expenseId, group.id);
  if (!existing) return res.status(404).json({ error: "Expense not found" });

  db.prepare("UPDATE expenses SET deleted_at = datetime('now') WHERE id = ?").run(existing.id);
  res.status(204).end();
});

module.exports = router;
