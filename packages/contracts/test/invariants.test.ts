import hardhat from "hardhat";
import { expect } from "chai";

const { ethers } = hardhat;

/**
 * Stateful invariants for JobRouterRegistry.
 *
 * The contract is small, so the invariant set is correspondingly
 * focused:
 *  - finalized is monotonic per jobId.
 *  - finalizeReceipt reverts without a prior recordAssignment.
 *  - recordAssignment reverts after finalizeReceipt.
 *  - non-owner write methods always revert.
 *
 * OpenZeppelin v5 Ownable emits a typed
 * `OwnableUnauthorizedAccount(address account)` custom error instead
 * of a string `not_owner` revert, so the non-owner checks below use
 * `revertedWithCustomError(..., "OwnableUnauthorizedAccount")`.
 */

describe("JobRouterRegistry invariants", () => {
  it("only owner can record or finalize", async () => {
    const [owner, attacker] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("JobRouterRegistry");
    const c = await Factory.deploy(owner.address);
    await c.waitForDeployment();
    const jobId = ethers.id("x");
    await expect(
      c
        .connect(attacker)
        .recordAssignment(jobId, ethers.id("d"), ethers.id("a"))
    ).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
    await expect(
      c
        .connect(attacker)
        .finalizeReceipt(jobId, ethers.id("r"), ethers.id("v"), 0)
    ).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
  });

  it("finalizeReceipt reverts without recordAssignment", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("JobRouterRegistry");
    const c = await Factory.deploy(owner.address);
    await c.waitForDeployment();
    const jobId = ethers.id("missing");
    await expect(
      c.connect(owner).finalizeReceipt(jobId, ethers.id("r"), ethers.id("v"), 0)
    ).to.be.revertedWith("no_assignment");
  });

  it("cannot record after finalize", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("JobRouterRegistry");
    const c = await Factory.deploy(owner.address);
    await c.waitForDeployment();
    const jobId = ethers.id("f");
    const dag = ethers.id("d");
    const aroot = ethers.id("a");
    await c.connect(owner).recordAssignment(jobId, dag, aroot);
    await c
      .connect(owner)
      .finalizeReceipt(jobId, ethers.id("r"), ethers.id("v"), 0);
    await expect(
      c.connect(owner).recordAssignment(jobId, dag, aroot)
    ).to.be.revertedWith("already_finalized");
  });

  it("fuzz: random owners cannot finalize", async () => {
    const [owner, ...others] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("JobRouterRegistry");
    const c = await Factory.deploy(owner.address);
    await c.waitForDeployment();
    for (let i = 0; i < Math.min(others.length, 8); i++) {
      const jobId = ethers.id(`j${i}`);
      await expect(
        c
          .connect(others[i]!)
          .finalizeReceipt(jobId, ethers.id("r"), ethers.id("v"), i)
      ).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");
    }
  });
});
