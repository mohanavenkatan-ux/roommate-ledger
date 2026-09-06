const express = require("express");
const db = require("../db");
const { newId } = require("../lib/ids");

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

// POST /api/groups/:groupId/payments  { from_person, to_person, amount, note? }
router.post("/", (req, res) => {
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const { from_person, to_person, amount, note } = req.body || {};
  if (!from_person || !to_person) {
    return res.status(400).json({ error: "from_person and to_person are required" });
  }
  if (from_person === to_person) {
    return res.status(400).json({ error: "from_person and to_person must be different" });
  }
  const amountCents = toCents(amount);
  if (amountCents === null || amountCents <= 0) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  const members = memberIds(group.id);
  if (!members.has(from_person) || !members.has(to_person)) {
    return res.status(400).json({ error: "Both people must be members of this group" });
  }

  const id = newId();
  db.prepare(
    "INSERT INTO payments (id, group_id, from_person, to_person, amount_cents, note) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, group.id, from_person, to_person, amountCents, note && typeof note === "string" ? note.trim() : null);

  res.status(201).json(
    db.prepare("SELECT id, group_id, from_person, to_person, amount_cents, note, created_at FROM payments WHERE id = ?").get(id)
  );
});

// GET /api/groups/:groupId/payments
router.get("/", (req, res) => {
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const rows = db
    .prepare(
      `SELECT id, group_id, from_person, to_person, amount_cents, note, created_at
       FROM payments WHERE group_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`
    )
    .all(group.id);
  res.json(rows);
});

// DELETE /api/groups/:groupId/payments/:paymentId
router.delete("/:paymentId", (req, res) => {
  const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });
  const existing = db
    .prepare("SELECT id FROM payments WHERE id = ? AND group_id = ? AND deleted_at IS NULL")
    .get(req.params.paymentId, group.id);
  if (!existing) return res.status(404).json({ error: "Payment not found" });

  db.prepare("UPDATE payments SET deleted_at = datetime('now') WHERE id = ?").run(existing.id);
  res.status(204).end();
});

module.exports = router;
