const hre = require("hardhat");
const fs = require("fs-extra");
const path = require("path");
require("dotenv").config();

const OUTPUT_PATH = path.join(__dirname, "..", "..", "backend", "config", "blockchain.json");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const EvidenceLog = await hre.ethers.getContractFactory("EvidenceLog");
  const evidenceLog = await EvidenceLog.deploy(deployer.address);
  await evidenceLog.waitForDeployment();

  const address = await evidenceLog.getAddress();
  console.log("EvidenceLog deployed to:", address);

  const artifact = await hre.artifacts.readArtifact("EvidenceLog");

  await fs.ensureFile(OUTPUT_PATH);
  await fs.writeJson(
    OUTPUT_PATH,
    {
      network: "ganache",
      contractAddress: address,
      abi: artifact.abi,
      deployedAt: new Date().toISOString(),
    },
    { spaces: 2 }
  );

  console.log("Contract ABI & address saved to:", OUTPUT_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
