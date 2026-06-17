import hardhat from "hardhat";

const { ethers } = hardhat;

/**
 * Deploy `JobRouterRegistry` to the configured Hardhat network.
 *
 * The constructor inherits from OpenZeppelin v5 `Ownable`, which
 * requires the initial owner to be passed explicitly. We pass the
 * deployer (the first signer returned by `ethers.getSigners()`),
 * so the deployer is the only address that can call
 * `recordAssignment` and `finalizeReceipt` immediately after the
 * contract is deployed. Ownership can be transferred later via
 * `Ownable.transferOwnership`.
 *
 * Required environment variables:
 *   - `PHAROS_RPC_URL`  (defaults to the Atlantic testnet endpoint)
 *
 * Required CLI / network configuration:
 *   - The deployer account must be funded with PHRS (the chain's
 *     native gas token) before this script can submit the deploy
 *     transaction. For the Atlantic testnet, ~0.05 PHRS is
 *     sufficient.
 *
 * After a successful deploy, the contract address is printed and
 * the same JSON payload is written to
 * `packages/contracts/deployments/<network>.json` so the API
 * server can pick it up via `PHAROS_REGISTRY_ADDRESS`.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying JobRouterRegistry with:", deployer.address);
  const Factory = await ethers.getContractFactory("JobRouterRegistry");
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  const network = await ethers.provider.getNetwork();
  console.log("JobRouterRegistry deployed to:", addr);
  const payload = {
    network: network.name,
    chainId: Number(network.chainId),
    address: addr,
    deployer: deployer.address,
  };
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
