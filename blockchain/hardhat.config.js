require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const { GANACHE_URL, GANACHE_PRIVATE_KEY } = process.env;

module.exports = {
  solidity: "0.8.20",
  networks: {
    ganache: {
      url: GANACHE_URL || "http://127.0.0.1:7545",
      accounts: GANACHE_PRIVATE_KEY ? [GANACHE_PRIVATE_KEY] : undefined,
      chainId: 1337,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
