import hardhat from "hardhat";
import { expect } from "chai";

const { ethers } = hardhat;

describe("JobRouterRegistry", () => {
  it("records assignment and finalizes receipt", async () => {
    const [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("JobRouterRegistry");
    // OpenZeppelin v5 Ownable requires the initial owner to be passed
    // to the constructor (see contracts/JobRouterRegistry.sol).
    const c = await Factory.deploy(owner.address);
    await c.waitForDeployment();

    const jobId = ethers.id("job-1");
    const dag = ethers.id("dag");
    const aroot = ethers.id("aroot");
    await c.connect(owner).recordAssignment(jobId, dag, aroot);
    expect(await c.dagHash(jobId)).to.equal(dag);
    expect(await c.assignmentRoot(jobId)).to.equal(aroot);
    expect(await c.finalized(jobId)).to.equal(false);

    await expect(
      c.connect(other).recordAssignment(jobId, dag, aroot)
    ).to.be.revertedWithCustomError(c, "OwnableUnauthorizedAccount");

    const rroot = ethers.id("rroot");
    const vroot = ethers.id("vroot");
    await c.connect(owner).finalizeReceipt(jobId, rroot, vroot, 1_000);
    expect(await c.finalized(jobId)).to.equal(true);

    await expect(
      c.connect(owner).recordAssignment(jobId, dag, aroot)
    ).to.be.revertedWith("already_finalized");
  });

  it("returns the full receipt", async () => {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("JobRouterRegistry");
    const c = await Factory.deploy(owner.address);
    await c.waitForDeployment();
    const jobId = ethers.id("job-2");
    const dag = ethers.id("dag");
    const aroot = ethers.id("aroot");
    await c.connect(owner).recordAssignment(jobId, dag, aroot);
    const r = await c.getReceipt(jobId);
    expect(r[0]).to.equal(dag);
    expect(r[1]).to.equal(aroot);
    expect(r[4]).to.equal(false);
  });

  it("transfers ownership", async () => {
    const [owner, next] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("JobRouterRegistry");
    const c = await Factory.deploy(owner.address);
    await c.waitForDeployment();
    await c.connect(owner).transferOwnership(next.address);
    expect(await c.owner()).to.equal(next.address);
  });
});
