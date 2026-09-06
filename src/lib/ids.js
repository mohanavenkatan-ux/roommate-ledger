const { customAlphabet } = require("nanoid");

// Unambiguous alphabet (no 0/O/1/I/l) so IDs are easy to read/type if ever needed.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 12);

module.exports = { newId: () => nanoid() };
