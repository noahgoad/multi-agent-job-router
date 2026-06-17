// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title JobRouterRegistry
 * @notice Anchors assignment receipts and terminal job receipts on
 * Pharos (chain id 688689). The contract does not store DAG or
 * result payloads; it stores their content hashes so any full node
 * can independently verify the workflow.
 *
 * Authorization is split: the deployer (owner) is the only address
 * allowed to call `recordAssignment` and `finalizeReceipt`. The
 * contract emits indexed events for every state change.
 */
contract JobRouterRegistry is Ownable {
    mapping(bytes32 => bytes32) public dagHash;
    mapping(bytes32 => bytes32) public assignmentRoot;
    mapping(bytes32 => bytes32) public resultRoot;
    mapping(bytes32 => bytes32) public verificationRoot;
    mapping(bytes32 => bool) public finalized;

    event AssignmentRecorded(
        bytes32 indexed jobId,
        bytes32 dagHash,
        bytes32 assignmentRoot,
        uint256 timestamp
    );
    event ReceiptFinalized(
        bytes32 indexed jobId,
        bytes32 resultRoot,
        bytes32 verificationRoot,
        uint256 totalSpent,
        uint256 timestamp
    );

    constructor(address initialOwner) Ownable(initialOwner) {}

    function recordAssignment(
        bytes32 jobId,
        bytes32 _dagHash,
        bytes32 _assignmentRoot
    ) external onlyOwner {
        require(!finalized[jobId], "already_finalized");
        dagHash[jobId] = _dagHash;
        assignmentRoot[jobId] = _assignmentRoot;
        emit AssignmentRecorded(jobId, _dagHash, _assignmentRoot, block.timestamp);
    }

    function finalizeReceipt(
        bytes32 jobId,
        bytes32 _resultRoot,
        bytes32 _verificationRoot,
        uint256 totalSpent
    ) external onlyOwner {
        require(dagHash[jobId] != bytes32(0), "no_assignment");
        require(!finalized[jobId], "already_finalized");
        resultRoot[jobId] = _resultRoot;
        verificationRoot[jobId] = _verificationRoot;
        finalized[jobId] = true;
        emit ReceiptFinalized(
            jobId,
            _resultRoot,
            _verificationRoot,
            totalSpent,
            block.timestamp
        );
    }

    function getReceipt(bytes32 jobId)
        external
        view
        returns (
            bytes32 _dagHash,
            bytes32 _assignmentRoot,
            bytes32 _resultRoot,
            bytes32 _verificationRoot,
            bool isFinalized
        )
    {
        return (
            dagHash[jobId],
            assignmentRoot[jobId],
            resultRoot[jobId],
            verificationRoot[jobId],
            finalized[jobId]
        );
    }
}