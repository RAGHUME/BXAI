// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EvidenceLog
 * @notice Anchors digital evidence metadata to an immutable ledger.
 * @dev Owner manages investigator permissions. Investigators create records.
 */
contract EvidenceLog is Ownable, ReentrancyGuard {
    struct Evidence {
        bytes32 id;
        bytes32 fileHash;
        address creator;
        address currentOwner;
        string description;
        uint256 timestamp;
        bool removed;
    }

    struct Explanation {
        string evidenceId;
        string explanationHash;
        address anchor;
        uint256 timestamp;
    }

    mapping(bytes32 => Evidence) private evidences;
    mapping(address => bool) private investigators;
    mapping(bytes32 => Explanation) private explanations;

    event EvidenceCreated(bytes32 indexed id, address indexed creator, bytes32 fileHash, string description);
    event EvidenceTransferred(bytes32 indexed id, address indexed from, address indexed to);
    event EvidenceRemoved(bytes32 indexed id, address indexed remover);
    event InvestigatorUpdated(address indexed account, bool allowed);
    event ExplanationAnchored(bytes32 indexed evidenceKey, address indexed anchor, string evidenceId, string explanationHash);

    constructor(address adminAddress) Ownable(adminAddress) {}

    error EvidenceAlreadyExists(bytes32 id);
    error EvidenceDoesNotExist(bytes32 id);
    error EvidenceRemovedError(bytes32 id);
    error NotInvestigator(address account);
    error NotCurrentOwner(address expectedOwner, address actualOwner);
    error InvalidAddress();
    error EmptyStringNotAllowed();

    modifier onlyInvestigator() {
        if (!investigators[_msgSender()]) {
            revert NotInvestigator(_msgSender());
        }
        _;
    }

    modifier evidenceMustExist(bytes32 id) {
        if (evidences[id].creator == address(0)) {
            revert EvidenceDoesNotExist(id);
        }
        _;
    }

    modifier evidenceMustBeActive(bytes32 id) {
        if (evidences[id].removed) {
            revert EvidenceRemovedError(id);
        }
        _;
    }

    /**
     * @notice Allow the contract owner to grant or revoke investigator access.
     */
    function setInvestigator(address account, bool allowed) external onlyOwner {
        if (account == address(0)) {
            revert InvalidAddress();
        }
        investigators[account] = allowed;
        emit InvestigatorUpdated(account, allowed);
    }

    /**
     * @notice Returns true if an address is permitted to create evidence entries.
     */
    function isInvestigator(address account) external view returns (bool) {
        return investigators[account];
    }

    /**
     * @notice Create a new evidence entry anchored on-chain.
     * @dev Evidence IDs must be unique.
     */
    function createEvidence(
        bytes32 id,
        bytes32 fileHash,
        string calldata description
    ) external onlyInvestigator nonReentrant {
        if (id == bytes32(0) || fileHash == bytes32(0)) {
            revert InvalidAddress();
        }
        if (evidences[id].creator != address(0) && !evidences[id].removed) {
            revert EvidenceAlreadyExists(id);
        }

        evidences[id] = Evidence({
            id: id,
            fileHash: fileHash,
            creator: _msgSender(),
            currentOwner: _msgSender(),
            description: description,
            timestamp: block.timestamp,
            removed: false
        });

        emit EvidenceCreated(id, _msgSender(), fileHash, description);
    }

    /**
     * @notice Transfer stewardship of an evidence record to a new owner.
     */
    function transferEvidence(bytes32 id, address newOwner)
        external
        evidenceMustExist(id)
        evidenceMustBeActive(id)
        nonReentrant
    {
        if (newOwner == address(0)) {
            revert InvalidAddress();
        }

        Evidence storage record = evidences[id];
        if (record.currentOwner != _msgSender()) {
            revert NotCurrentOwner(record.currentOwner, _msgSender());
        }

        address previousOwner = record.currentOwner;
        record.currentOwner = newOwner;

        emit EvidenceTransferred(id, previousOwner, newOwner);
    }

    /**
     * @notice Soft-remove an evidence record. Only the contract owner or current owner may perform this action.
     */
    function removeEvidence(bytes32 id)
        external
        evidenceMustExist(id)
        evidenceMustBeActive(id)
        nonReentrant
    {
        Evidence storage record = evidences[id];
        if (_msgSender() != owner() && _msgSender() != record.currentOwner) {
            revert NotCurrentOwner(record.currentOwner, _msgSender());
        }

        record.removed = true;

        emit EvidenceRemoved(id, _msgSender());
    }

    /**
     * @notice Retrieve an evidence record by id.
     */
    function getEvidence(bytes32 id) external view returns (Evidence memory) {
        if (evidences[id].creator == address(0)) {
            revert EvidenceDoesNotExist(id);
        }
        return evidences[id];
    }

    /**
     * @notice Anchor an explanation hash for off-chain XAI artefacts.
     */
    function anchorExplanation(string memory evidenceId, string memory explanationHash)
        external
        onlyInvestigator
        nonReentrant
    {
        if (bytes(evidenceId).length == 0 || bytes(explanationHash).length == 0) {
            revert EmptyStringNotAllowed();
        }

        bytes32 evidenceKey = keccak256(abi.encodePacked(evidenceId));
        explanations[evidenceKey] = Explanation({
            evidenceId: evidenceId,
            explanationHash: explanationHash,
            anchor: _msgSender(),
            timestamp: block.timestamp
        });

        emit ExplanationAnchored(evidenceKey, _msgSender(), evidenceId, explanationHash);
    }

    function getExplanation(string memory evidenceId)
        external
        view
        returns (string memory, string memory, address, uint256)
    {
        if (bytes(evidenceId).length == 0) {
            revert EmptyStringNotAllowed();
        }
        bytes32 evidenceKey = keccak256(abi.encodePacked(evidenceId));
        Explanation memory explanation = explanations[evidenceKey];
        if (explanation.anchor == address(0)) {
            revert EvidenceDoesNotExist(evidenceKey);
        }
        return (explanation.evidenceId, explanation.explanationHash, explanation.anchor, explanation.timestamp);
    }
}
