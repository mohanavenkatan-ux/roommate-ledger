const path = require("path");
const express = require("express");

require("./db"); // ensures schema exists before routes touch it

const groupsRouter = require("./routes/groups");
const expensesRouter = require("./routes/expenses");
const paymentsRouter = require("./routes/payments");
const balancesRouter = require("./routes/balances");

const app = express();
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/groups", groupsRouter);
app.use("/api/groups/:groupId/expenses", expensesRouter);
app.use("/api/groups/:groupId/payments", paymentsRouter);
app.use("/api/groups/:groupId/balances", balancesRouter);

// Static frontend build (added in Phase 3) will be served from here.
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`roommate-ledger listening on :${PORT}`));
}

module.exports = app;
