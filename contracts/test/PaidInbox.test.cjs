const { expect } = require("chai");
const chai = require("chai");
chai.use(require("chai-as-promised"));
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { parseEther, zeroHash, zeroAddress, maxUint256 } = require("viem");

const CT = "0xdeadbeef";
const ETH = zeroAddress;
const Rule = { Refund: 0, Keep: 1, Split: 2 };

async function setup() {
  const [treasury, alice, bob, carol] = await hre.viem.getWalletClients();
  const inbox = await hre.viem.deployContract("PaidInbox", [treasury.account.address]);
  const pons = await hre.viem.deployContract("MockERC20", ["Pons", "PONS"]);
  const pub = await hre.viem.getPublicClient();
  const as = (w) => hre.viem.getContractAt("PaidInbox", inbox.address, { client: { wallet: w } });
  const tokenAs = (w) => hre.viem.getContractAt("MockERC20", pons.address, { client: { wallet: w } });
  for (const w of [alice, bob, carol]) {
    await pons.write.mint([w.account.address, parseEther("100000")]);
    await (await tokenAs(w)).write.approve([inbox.address, maxUint256]);
  }
  const ethBal = (w) => pub.getBalance({ address: w.account.address });
  const ponsBal = (w) => pons.read.balanceOf([w.account.address]);
  return { treasury, alice, bob, carol, inbox, pons, pub, as, tokenAs, ethBal, ponsBal };
}
const gasOf = async (pub, hash) => { const r = await pub.getTransactionReceipt({ hash }); return r.gasUsed * r.effectiveGasPrice; };

describe("PaidInbox v2", () => {
  describe("setup and quoting", () => {
    it("rejects messages to unregistered wallets", async () => {
      const { alice, bob, as } = await setup();
      await expect((await as(alice)).write.send([bob.account.address, ETH, CT])).to.be.rejectedWith("NotRegistered");
    });

    it("configure() sets inbox and several prices in one call", async () => {
      const { alice, bob, inbox, pons, as } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [ETH, pons.address], [parseEther("0.01"), parseEther("500")]]);
      expect(await inbox.read.quote([alice.account.address, bob.account.address, ETH])).to.equal(parseEther("0.01"));
      expect(await inbox.read.quote([alice.account.address, bob.account.address, pons.address])).to.equal(parseEther("500"));
    });

    it("refuses an asset the recipient does not accept", async () => {
      const { alice, bob, pons, as } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [ETH], [parseEther("0.01")]]);
      await expect((await as(alice)).write.send([bob.account.address, pons.address, CT])).to.be.rejectedWith("NotAccepted");
    });

    it("open inbox is free for everyone and rejects stray ETH", async () => {
      const { alice, bob, inbox, as } = await setup();
      await (await as(bob)).write.setInbox([true, Rule.Refund, zeroHash]);
      await (await as(alice)).write.send([bob.account.address, ETH, CT]);
      expect(await inbox.read.nextId()).to.equal(1n);
      await expect((await as(alice)).write.send([bob.account.address, ETH, CT], { value: 1n })).to.be.rejectedWith("UnexpectedEth");
    });

    it("cannot message yourself", async () => {
      const { alice, as } = await setup();
      await (await as(alice)).write.setInbox([true, Rule.Refund, zeroHash]);
      await expect((await as(alice)).write.send([alice.account.address, ETH, CT])).to.be.rejectedWith("SelfMessage");
    });
  });

  describe("paying in ETH", () => {
    it("requires the exact price and escrows it", async () => {
      const { alice, bob, inbox, pub, as } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [ETH], [parseEther("0.01")]]);
      const a = await as(alice);
      await expect(a.write.send([bob.account.address, ETH, CT], { value: parseEther("0.005") })).to.be.rejectedWith("WrongPayment");
      await a.write.send([bob.account.address, ETH, CT], { value: parseEther("0.01") });
      expect(await pub.getBalance({ address: inbox.address })).to.equal(parseEther("0.01"));
    });

    it("Keep: recipient 95%, treasury 5%, then contacts write for free", async () => {
      const { treasury, alice, bob, inbox, pub, as, ethBal } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [ETH], [parseEther("1")]]);
      await (await as(alice)).write.send([bob.account.address, ETH, CT], { value: parseEther("1") });
      const t0 = await ethBal(treasury), b0 = await ethBal(bob);
      const h = await (await as(bob)).write.reply([1n, CT]);
      expect((await ethBal(treasury)) - t0).to.equal(parseEther("0.05"));
      expect((await ethBal(bob)) - b0 + (await gasOf(pub, h))).to.equal(parseEther("0.95"));
      expect(await inbox.read.quote([alice.account.address, bob.account.address, ETH])).to.equal(0n);
      await (await as(alice)).write.send([bob.account.address, ETH, CT]);
    });

    it("refund only after 72 h, callable by anyone", async () => {
      const { alice, bob, carol, as, ethBal } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [ETH], [parseEther("0.2")]]);
      await (await as(alice)).write.send([bob.account.address, ETH, CT], { value: parseEther("0.2") });
      await expect((await as(carol)).write.refund([1n])).to.be.rejectedWith("NotExpired");
      await time.increase(72 * 3600 + 1);
      await expect((await as(bob)).write.reply([1n, CT])).to.be.rejectedWith("Expired");
      const a0 = await ethBal(alice);
      await (await as(carol)).write.refund([1n]);
      expect((await ethBal(alice)) - a0).to.equal(parseEther("0.2"));
      await expect((await as(carol)).write.refund([1n])).to.be.rejectedWith("NotPending");
    });
  });

  describe("paying in PONS (ERC-20)", () => {
    it("pulls the quoted PONS into escrow and rejects attached ETH", async () => {
      const { alice, bob, inbox, pons, as, ponsBal } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [pons.address], [parseEther("500")]]);
      await expect((await as(alice)).write.send([bob.account.address, pons.address, CT], { value: 1n })).to.be.rejectedWith("UnexpectedEth");
      const a0 = await ponsBal(alice);
      await (await as(alice)).write.send([bob.account.address, pons.address, CT]);
      expect(a0 - (await ponsBal(alice))).to.equal(parseEther("500"));
      expect(await pons.read.balanceOf([inbox.address])).to.equal(parseEther("500"));
      const p = await inbox.read.payments([1n]);
      expect(p[2].toLowerCase()).to.equal(pons.address.toLowerCase());
    });

    it("Keep: 475 PONS to recipient, 25 PONS to treasury", async () => {
      const { treasury, alice, bob, pons, as, ponsBal } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [pons.address], [parseEther("500")]]);
      await (await as(alice)).write.send([bob.account.address, pons.address, CT]);
      const b0 = await ponsBal(bob);
      await (await as(bob)).write.reply([1n, CT]);
      expect((await ponsBal(bob)) - b0).to.equal(parseEther("475"));
      expect(await pons.read.balanceOf([treasury.account.address])).to.equal(parseEther("25"));
    });

    it("Refund: all PONS back to the sender, no fee", async () => {
      const { treasury, alice, bob, pons, as, ponsBal } = await setup();
      await (await as(bob)).write.configure([false, Rule.Refund, zeroHash, [pons.address], [parseEther("500")]]);
      const a0 = await ponsBal(alice);
      await (await as(alice)).write.send([bob.account.address, pons.address, CT]);
      await (await as(bob)).write.reply([1n, CT]);
      expect(await ponsBal(alice)).to.equal(a0);
      expect(await pons.read.balanceOf([treasury.account.address])).to.equal(0n);
    });

    it("Split: 250 back, 237.5 recipient, 12.5 treasury", async () => {
      const { treasury, alice, bob, pons, as, ponsBal } = await setup();
      await (await as(bob)).write.configure([false, Rule.Split, zeroHash, [pons.address], [parseEther("500")]]);
      await (await as(alice)).write.send([bob.account.address, pons.address, CT]);
      const a0 = await ponsBal(alice), b0 = await ponsBal(bob);
      await (await as(bob)).write.reply([1n, CT]);
      expect((await ponsBal(alice)) - a0).to.equal(parseEther("250"));
      expect((await ponsBal(bob)) - b0).to.equal(parseEther("237.5"));
      expect(await pons.read.balanceOf([treasury.account.address])).to.equal(parseEther("12.5"));
    });

    it("expired PONS payment is refunded in PONS", async () => {
      const { alice, bob, carol, pons, as, ponsBal } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [pons.address], [parseEther("500")]]);
      const a0 = await ponsBal(alice);
      await (await as(alice)).write.send([bob.account.address, pons.address, CT]);
      await time.increase(72 * 3600 + 1);
      await (await as(carol)).write.refund([1n]);
      expect(await ponsBal(alice)).to.equal(a0);
    });

    it("fails cleanly without allowance", async () => {
      const { alice, bob, pons, as, tokenAs } = await setup();
      await (await tokenAs(alice)).write.approve([(await as(alice)).address, 0n]);
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [pons.address], [parseEther("500")]]);
      await expect((await as(alice)).write.send([bob.account.address, pons.address, CT])).to.be.rejectedWith("TransferFailed");
    });

    it("escrows what actually arrives for fee-on-transfer tokens", async () => {
      const { alice, bob, inbox, pons, as } = await setup();
      await pons.write.setFee([100n]); // 1%
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [pons.address], [parseEther("500")]]);
      await (await as(alice)).write.send([bob.account.address, pons.address, CT]);
      const p = await inbox.read.payments([1n]);
      expect(p[3]).to.equal(parseEther("495"));
    });
  });

  describe("access control", () => {
    it("only the recipient can reply, and only once", async () => {
      const { alice, bob, carol, as } = await setup();
      await (await as(bob)).write.configure([false, Rule.Keep, zeroHash, [ETH], [parseEther("0.1")]]);
      await (await as(alice)).write.send([bob.account.address, ETH, CT], { value: parseEther("0.1") });
      await expect((await as(carol)).write.reply([1n, CT])).to.be.rejectedWith("NotRecipient");
      await (await as(bob)).write.reply([1n, CT]);
      await expect((await as(bob)).write.reply([1n, CT])).to.be.rejectedWith("NotPending");
    });
  });
});
