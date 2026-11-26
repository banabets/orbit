// Copies PaidInbox's ABI + creation bytecode into the web app so a wallet can deploy it from the browser.
const fs = require("fs");
const path = require("path");
const art = require(path.join(__dirname, "..", "artifacts", "contracts", "PaidInbox.sol", "PaidInbox.json"));
const out = path.join(__dirname, "..", "..", "web", "src", "contracts", "PaidInbox.artifact.json");
fs.writeFileSync(out, JSON.stringify({ contractName: art.contractName, abi: art.abi, bytecode: art.bytecode }, null, 2));
console.log(`PaidInbox artifact -> ${out} (${(art.bytecode.length - 2) / 2} bytes)`);
