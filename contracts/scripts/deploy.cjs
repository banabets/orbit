// Deploys PaidInbox and writes the address, ABI and payment assets into the web app.
//   local devnet : also deploys "PONS (dev)" and funds the three test wallets
//   robinhood    : uses the real PONS token on Robinhood Chain (chainId 4663)
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { parseEther } = require("viem");

const REAL_PONS = "0x39dBED3a2bd333467115dE45665cC57F813C4571";
// Hardhat test accounts #1-#3 (the devnet personas in the web app)
const PERSONAS = ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", "0x90F79bf6EB2c4f870365E785982E1f101E93b906"];

async function main() {
  const [deployer] = await hre.viem.getWalletClients();
  const pub = await hre.viem.getPublicClient();
  const chainId = await pub.getChainId();
  const treasury = process.env.TREASURY || deployer.account.address;

  const inbox = await hre.viem.deployContract("PaidInbox", [treasury]);
  let pons = REAL_PONS;
  if (chainId === 31337) {
    const mock = await hre.viem.deployContract("MockERC20", ["Pons (dev)", "PONS"]);
    for (const a of PERSONAS) await mock.write.mint([a, parseEther("100000")]);
    pons = mock.address;
  }

  const inboxArt = await hre.artifacts.readArtifact("PaidInbox");
  const dir = path.join(__dirname, "..", "..", "web", "src", "contracts");
  // deployment.json is the local devnet config; mainnet gets its own file below
  const out = path.join(dir, chainId === 4663 ? "deployment.mainnet.json" : "deployment.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    chainId, address: inbox.address, treasury,
    assets: { ETH: "0x0000000000000000000000000000000000000000", PONS: pons },
    abi: inboxArt.abi,
  }, null, 2));
  if (chainId === 4663) {
    // the web app reads this file to find the shared mainnet inbox
    const deployBlock = Number(await pub.getBlockNumber()) - 50;
    fs.writeFileSync(path.join(path.dirname(out), "mainnet.json"), JSON.stringify({ address: inbox.address, deployBlock, treasury }, null, 2));
  }
  console.log(`PaidInbox ${inbox.address} · PONS ${pons} · chain ${chainId} -> ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
