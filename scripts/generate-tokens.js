const fs = require("node:fs");
const path = require("node:path");
const { ensureAccessTokens } = require("../server");

const file = path.join(__dirname, "..", "data", "bets.json");
const db = JSON.parse(fs.readFileSync(file, "utf8"));
const changed = ensureAccessTokens(db);
if (changed) fs.writeFileSync(file, `${JSON.stringify(db, null, 2)}\n`);
console.log(JSON.stringify({ participants:Object.keys(db).length, changed }, null, 2));
