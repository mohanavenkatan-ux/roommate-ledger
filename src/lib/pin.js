const crypto = require("crypto");

function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPin(pin, stored) {
  if (!stored) return true; // group has no PIN set
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(String(pin || ""), salt, 32);
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPin, verifyPin };
