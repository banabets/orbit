require("@nomicfoundation/hardhat-viem");
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    robinhood: { url: "https://rpc.mainnet.chain.robinhood.com", chainId: 4663, accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [] },
  },
};
