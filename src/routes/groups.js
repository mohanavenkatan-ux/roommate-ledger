const express = require("express");
const db = require("../db");
const { newId } = require("../lib/ids");
const { hashPin, verifyPin } = require("../lib/pin");

const router = express.Router();

function getGroupOr404(req, res) {
  const group = db.prepare("SELECT id, name, currency, created_at, (pin_hash IS NOT NULL) as has_pin FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return null;
  }
  group.has_pin = !!group.has_pin;
  return group;
}

function getMembers(groupId) {
  return db
    .prepare(
      `SELECT p.id, p.name FROM people p
       JOIN group_members gm ON gm.person_id = p.id
       WHERE gm.group_id = ?
       ORDER BY gm.joined_at ASC`
    )
    .all(groupId);
}

// POST /api/groups  { name, currency?, pin? }
router.post("/", (req, res) => {
  const { name, currency, pin } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const id = newId();
  db.prepare("INSERT INTO groups (id, name, currency, pin_hash) VALUES (?, ?, ?, ?)").run(
    id,
    name.trim(),
    currency && typeof currency === "string" ? currency : "$",
    pin ? hashPin(pin) : null
  );
  res.status(201).json({ id, name: name.trim(), currency: currency || "$", has_pin: !!pin });
});

// GET /api/groups/:groupId
router.get("/:groupId", (req, res) => {
  const group = getGroupOr404(req, res);
  if (!group) return;
  res.json({ ...group, members: getMembers(group.id) });
});

// GET /api/groups/:groupId/people
router.get("/:groupId/people", (req, res) => {
  const group = getGroupOr404(req, res);
  if (!group) return;
  res.json(getMembers(group.id));
});

// POST /api/groups/:groupId/join  { name, pin? }
// Picks an existing member by name (case-insensitive) or creates a new one.
router.post("/:groupId/join", (req, res) => {
  const group = db.prepare("SELECT id, pin_hash FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const { name, pin } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!verifyPin(pin, group.pin_hash)) {
    return res.status(403).json({ error: "Incorrect PIN" });
  }

  const trimmed = name.trim();
  const existing = db
    .prepare(
      `SELECT p.id, p.name FROM people p
       JOIN group_members gm ON gm.person_id = p.id
       WHERE gm.group_id = ? AND LOWER(p.name) = LOWER(?)`
    )
    .get(group.id, trimmed);

  if (existing) {
    return res.json({ person: existing, members: getMembers(group.id) });
  }

  const personId = newId();
  const insertPerson = db.prepare("INSERT INTO people (id, name) VALUES (?, ?)");
  const insertMember = db.prepare("INSERT INTO group_members (group_id, person_id) VALUES (?, ?)");
  db.transaction(() => {
    insertPerson.run(personId, trimmed);
    insertMember.run(group.id, personId);
  })();

  res.status(201).json({ person: { id: personId, name: trimmed }, members: getMembers(group.id) });
});

module.exports = router;
