const { expect } = require("chai");
const { ethers } = require("hardhat");

const BASE_URI = "https://raw.githubusercontent.com/nugian10/ZENSAI/main/collection/metadata/";
const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const P2 = ethers.parseEther("0.0002");
const P11 = ethers.parseEther("0.0004");
const P21 = ethers.parseEther("0.0008");

function priceAtSlot(n) {
  if (n <= 10) return P2;
  if (n <= 20) return P11;
  return P21;
}
function ladderSum(from, to) {
  let s = 0n;
  for (let n = from; n <= to; n++) s += priceAtSlot(n);
  return s;
}

async function deployFixture() {
  const [owner, revenue, alice, bob] = await ethers.getSigners();
  const Mock = await ethers.getContractFactory("MockAgentIdRegistry");
  const mock = await Mock.deploy();
  await mock.waitForDeployment();
  const Token = await ethers.getContractFactory("ZensaiToken");
  const token = await Token.deploy(owner.address);
  await token.waitForDeployment();
  const Nft = await ethers.getContractFactory("ZensaiNFT");
  const nft = await Nft.deploy(owner.address, revenue.address, await mock.getAddress(), BASE_URI, await token.getAddress());
  await nft.waitForDeployment();
  // Real deploy flow step (3): owner authorizes the NFT as token minter.
  await token.setMinter(await nft.getAddress(), true);
  return { nft, token, mock, owner, revenue, alice, bob };
}

describe("ZensaiNFT", function () {
  it("constructor: supply, royalty, owner, revenue, registry", async function () {
    const { nft, owner, revenue, mock } = await deployFixture();
    expect(await nft.MAX_SUPPLY()).to.equal(3333);
    expect(await nft.MAX_PER_WALLET()).to.equal(30);
    expect(await nft.owner()).to.equal(owner.address);
    expect(await nft.revenueWallet()).to.equal(revenue.address);
    expect(await nft.agentIdRegistry()).to.equal(await mock.getAddress());
    expect(await nft.name()).to.equal("ZENSAI");
    expect(await nft.symbol()).to.equal("ZSAI");
    const [receiver, amount] = await nft.royaltyInfo(1, 10000);
    expect(receiver).to.equal(revenue.address);
    expect(amount).to.equal(500); // 5%
    expect(await nft.totalSupply()).to.equal(0);
    expect(await nft.mintActive()).to.equal(false);
  });

  it("rarityOf / variantOf by ID range", async function () {
    const { nft } = await deployFixture();
    expect(await nft.rarityOf(1)).to.equal(0);
    expect(await nft.rarityOf(1667)).to.equal(0);
    expect(await nft.rarityOf(1668)).to.equal(1);
    expect(await nft.rarityOf(2500)).to.equal(1);
    expect(await nft.rarityOf(2501)).to.equal(2);
    expect(await nft.rarityOf(3000)).to.equal(2);
    expect(await nft.rarityOf(3001)).to.equal(3);
    expect(await nft.rarityOf(3217)).to.equal(3);
    expect(await nft.rarityOf(3218)).to.equal(4);
    expect(await nft.rarityOf(3333)).to.equal(4);
    expect(await nft.variantOf(1)).to.equal("Pine Bonsai");
    expect(await nft.variantOf(2000)).to.equal("Juniper Bonsai");
    expect(await nft.variantOf(2600)).to.equal("Sakura Bonsai");
    expect(await nft.variantOf(3100)).to.equal("Wisteria Bonsai");
    expect(await nft.variantOf(3300)).to.equal("Golden Pine Bonsai");
    await expect(nft.rarityOf(0)).to.be.revertedWithCustomError(nft, "ExceedsMaxSupply");
    await expect(nft.rarityOf(3334)).to.be.revertedWithCustomError(nft, "ExceedsMaxSupply");
  });

  it("mint reverts while inactive; paid mint open to everyone (no Agent ID)", async function () {
    const { nft, alice, revenue } = await deployFixture();
    await expect(nft.connect(alice).mint(1, false, { value: P2 }))
      .to.be.revertedWithCustomError(nft, "MintInactive");
    await nft.setMintActive(true);
    const revBefore = await ethers.provider.getBalance(revenue.address);
    await expect(nft.connect(alice).mint(1, false, { value: P2 }))
      .to.emit(nft, "Minted").withArgs(alice.address, 1, P2, 0, false);
    expect(await nft.ownerOf(1)).to.equal(alice.address);
    expect(await nft.totalSupply()).to.equal(1);
    expect(await nft.mintCount(alice.address)).to.equal(1);
    expect(await ethers.provider.getBalance(revenue.address) - revBefore).to.equal(P2);
    expect(await nft.tokenURI(1)).to.equal(BASE_URI + "1.json");
  });

  it("free mint requires Agent ID; 1 per wallet; lands on highest-priced slot in bulk", async function () {
    const { nft, mock, alice, bob } = await deployFixture();
    await nft.setMintActive(true);
    // no Agent ID -> free reverts
    await expect(nft.connect(alice).mint(1, true, { value: 0 }))
      .to.be.revertedWithCustomError(nft, "NoAgentId");
    // give Alice an Agent ID
    await mock.mintTo(alice.address);
    expect(await nft.holdsAgentId(alice.address)).to.equal(true);
    expect(await nft.holdsAgentId(bob.address)).to.equal(false);
    // bulk 30 with free: slots 1..30 cost 0.0138, free on a 0.0008 slot -> 0.013
    const [price, freeSlot] = await nft.quoteBulk(alice.address, 30, true);
    expect(price).to.equal(ethers.parseEther("0.0132"));
    expect(freeSlot).to.equal(29); // last (highest-priced) slot
    const tx = await nft.connect(alice).mint(30, true, { value: price });
    await expect(tx).to.emit(nft, "Minted");
    expect(await nft.mintCount(alice.address)).to.equal(30);
    expect(await nft.freeUsed(alice.address)).to.equal(true);
    expect(await nft.ownerOf(30)).to.equal(alice.address);
    // 31st mint reverts (max 30 — cap check fires before the free check)
    await expect(nft.connect(alice).mint(1, false, { value: P2 }))
      .to.be.revertedWithCustomError(nft, "MaxPerWallet");
    await expect(nft.connect(alice).mint(1, true, { value: 0 }))
      .to.be.revertedWithCustomError(nft, "MaxPerWallet");
    // second free reverts FreeAlreadyUsed (fresh wallet, under the cap)
    await mock.mintTo(bob.address);
    await nft.connect(bob).mint(1, true, { value: 0 });
    expect(await nft.freeUsed(bob.address)).to.equal(true);
    await expect(nft.connect(bob).mint(1, true, { value: 0 }))
      .to.be.revertedWithCustomError(nft, "FreeAlreadyUsed");
  });

  it("quoteBulk ladder: 9 paid = 0.0018, 10 paid crossing bands, 30 paid = 0.014", async function () {
    const { nft, alice } = await deployFixture();
    const [p9] = await nft.quoteBulk(alice.address, 9, false);
    expect(p9).to.equal(9n * P2); // 0.0018
    const [p30] = await nft.quoteBulk(alice.address, 30, false);
    expect(p30).to.equal(ethers.parseEther("0.014"));
    // mint 10 paid (0.002), next 10 cost 0.004, next 10 cost 0.008
    await nft.setMintActive(true);
    await nft.connect(alice).mint(10, false, { value: ethers.parseEther("0.002") });
    const [pNext] = await nft.quoteBulk(alice.address, 10, false);
    expect(pNext).to.equal(10n * P11);
    expect(await nft.priceFor(alice.address)).to.equal(P11);
  });

  it("underpayment reverts; overpayment refunded; sequential IDs", async function () {
    const { nft, alice, bob } = await deployFixture();
    await nft.setMintActive(true);
    await expect(nft.connect(alice).mint(2, false, { value: P2 }))
      .to.be.revertedWithCustomError(nft, "IncorrectPayment");
    const balBefore = await ethers.provider.getBalance(bob.address);
    const tx = await nft.connect(bob).mint(2, false, { value: ethers.parseEther("0.01") });
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const balAfter = await ethers.provider.getBalance(bob.address);
    expect(balBefore - balAfter - gas).to.equal(2n * P2); // only 0.0004 kept, rest refunded
    expect(await nft.ownerOf(1)).to.equal(bob.address);
    expect(await nft.ownerOf(2)).to.equal(bob.address);
  });

  it("quantity 0 / 31 reverts; sold out guard via quote", async function () {
    const { nft, alice } = await deployFixture();
    await expect(nft.quoteBulk(alice.address, 0, false)).to.be.revertedWithCustomError(nft, "MaxPerWallet");
    await expect(nft.quoteBulk(alice.address, 31, false)).to.be.revertedWithCustomError(nft, "MaxPerWallet");
  });

  it("owner can toggle mintActive / baseURI; non-owner cannot", async function () {
    const { nft, alice } = await deployFixture();
    await expect(nft.connect(alice).setMintActive(true)).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    await nft.setMintActive(true);
    expect(await nft.mintActive()).to.equal(true);
    await nft.setBaseURI("ipfs://test/");
    expect(await nft.baseURI()).to.equal("ipfs://test/");
  });
});

describe("ZensaiToken ($ZSAI)", function () {
  it("cap 1B, treasury 460M pre-minted to owner, bonus pool 540M", async function () {
    const { token, owner } = await deployFixture();
    expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther("1000000000"));
    expect(await token.TREASURY()).to.equal(ethers.parseEther("460000000"));
    expect(await token.BONUS_POOL()).to.equal(ethers.parseEther("540000000"));
    expect(await token.name()).to.equal("Zensai Token");
    expect(await token.symbol()).to.equal("ZSAI");
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("460000000"));
    expect(await token.totalSupply()).to.equal(ethers.parseEther("460000000"));
    expect(await token.bonusMinted()).to.equal(0);
    expect(await token.bonusRemaining()).to.equal(ethers.parseEther("540000000"));
    // worst case for the pool: 3333 paid mints x 120k = 399.96M < 540M
    const worst = 3333n * ethers.parseEther("120000");
    expect(worst).to.equal(ethers.parseEther("399960000"));
    expect(worst < ethers.parseEther("540000000")).to.equal(true);
  });

  it("paid mint reverts before setMinter; direct mint from non-minter reverts", async function () {
    const [owner, revenue, alice] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockAgentIdRegistry");
    const mock = await Mock.deploy();
    const Token = await ethers.getContractFactory("ZensaiToken");
    const token = await Token.deploy(owner.address);
    const Nft = await ethers.getContractFactory("ZensaiNFT");
    const nft = await Nft.deploy(owner.address, revenue.address, await mock.getAddress(), BASE_URI, await token.getAddress());
    await nft.setMintActive(true);
    await expect(nft.connect(alice).mint(1, false, { value: P2 }))
      .to.be.revertedWithCustomError(token, "NotMinter");
    await expect(token.connect(alice).mint(alice.address, 1000))
      .to.be.revertedWithCustomError(token, "NotMinter");
    // owner itself cannot mint (only authorized minters)
    await expect(token.connect(owner).mint(alice.address, 1000))
      .to.be.revertedWithCustomError(token, "NotMinter");
    // after setMinter, paid mint works
    await token.setMinter(await nft.getAddress(), true);
    await nft.connect(alice).mint(1, false, { value: P2 });
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("120000"));
  });

  it("120k ZSAI per paid mint, 0 for free; bulk 30 with free = 29 x 120k", async function () {
    const { nft, token, mock, alice, bob } = await deployFixture();
    await nft.setMintActive(true);
    await mock.mintTo(alice.address);
    const [price] = await nft.quoteBulk(alice.address, 30, true);
    await nft.connect(alice).mint(30, true, { value: price });
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("3480000")); // 29 paid
    expect(await token.bonusMinted()).to.equal(ethers.parseEther("3480000"));
    // 30 paid, no free (bob): 3,600,000
    const [priceBob] = await nft.quoteBulk(bob.address, 30, false);
    await nft.connect(bob).mint(30, false, { value: priceBob });
    expect(await token.balanceOf(bob.address)).to.equal(ethers.parseEther("3600000"));
    expect(await token.bonusMinted()).to.equal(ethers.parseEther("7080000"));
  });

  it("single free mint earns 0 ZSAI", async function () {
    const { nft, token, mock, alice } = await deployFixture();
    await nft.setMintActive(true);
    await mock.mintTo(alice.address);
    await nft.connect(alice).mint(1, true, { value: 0 });
    expect(await token.balanceOf(alice.address)).to.equal(0);
    expect(await nft.ownerOf(1)).to.equal(alice.address);
  });
});
