const { ethers } = require("hardhat");

async function main() {
  const OWNER = "0x0262e8e5E4584D8AB840fD950a6E2E0A414d4097";
  const REVENUE = "0x89c37649Ba3BAA9E1ce028612b7DE4e9c3a947B7";
  const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
  const BASE = "https://raw.githubusercontent.com/nugian10/ZENSAI/main/collection/metadata/";
  const Token = await ethers.getContractFactory("ZensaiToken");
  const Nft = await ethers.getContractFactory("ZensaiNFT");
  const txT = await Token.getDeployTransaction(OWNER);
  const gasT = await ethers.provider.estimateGas(txT);
  // NFT estimate needs a token address; use a placeholder (gas barely differs).
  const txN = await Nft.getDeployTransaction(OWNER, REVENUE, REGISTRY, BASE, OWNER);
  const gasN = await ethers.provider.estimateGas(txN);
  const fee = await ethers.provider.getFeeData();
  const gp = fee.gasPrice || 0n;
  console.log("ZensaiToken deploy gas:", gasT.toString());
  console.log("ZensaiNFT deploy gas:", gasN.toString());
  console.log("TOTAL deploy gas:", (gasT + gasN).toString());
  console.log("gas price (gwei):", ethers.formatUnits(gp, "gwei"));
  console.log("TOTAL cost BNB @ current gas price:", ethers.formatEther((gasT + gasN) * gp));
  console.log("TOTAL cost BNB @ 0.1 gwei:", ethers.formatEther((gasT + gasN) * 100000000n));
  console.log("TOTAL cost BNB @ 1 gwei:", ethers.formatEther((gasT + gasN) * 1000000000n));
  console.log("NOTE: + setMinter tx (~50k gas) and setMintActive tx (~50k gas) after deploy.");
}
main().catch((e) => { console.error(e); process.exit(1); });
