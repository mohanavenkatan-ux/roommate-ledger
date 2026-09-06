const express = require("express");
const db = require("../db");
const { computeGroupBalances, simplifyDebts } = require("../lib/balances");

const router = express.Router({ mergeParams: true });

// GET /api/groups/:groupId/balances
router.get("/", (req, res) => {
  const group = db.prepare("SELECT id, currency FROM groups WHERE id = ?").get(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  const members = db
    .prepare(
      `SELECT p.id, p.name FROM people p
       JOIN group_members gm ON gm.person_id = p.id
       WHERE gm.group_id = ?
       ORDER BY gm.joined_at ASC`
    )
    .all(group.id);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  const balanceMap = computeGroupBalances(group.id);
  const balances = members.map((m) => ({
    person_id: m.id,
    name: m.name,
    net_cents: balanceMap.get(m.id) || 0,
  }));

  const settlements = simplifyDebts(balances).map((s) => ({
    ...s,
    from_name: nameById.get(s.from_person_id),
    to_name: nameById.get(s.to_person_id),
  }));

  res.json({ currency: group.currency, balances, settlements });
});

module.exports = router;
