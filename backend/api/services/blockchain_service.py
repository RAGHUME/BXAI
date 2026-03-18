"""Service utilities for interacting with the EvidenceLog smart contract.

This module coordinates Web3 interactions with Ganache and persists blockchain
activity into MongoDB collections. It expects ``GANACHE_URL`` and
``GANACHE_PRIVATE_KEY`` to be configured in ``backend/.env`` and a contract ABI
and address stored at ``backend/config/blockchain.json``.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Optional

from eth_account import Account
from pymongo.collection import Collection
from web3 import Web3
try:  # Web3 < 6
    from web3.middleware import geth_poa_middleware  # type: ignore

    def _inject_poa_middleware(web3: Web3) -> None:
        try:
            web3.middleware_onion.inject(geth_poa_middleware, layer=0)
        except ValueError:
            pass

except ImportError:  # Web3 >= 6
    from web3.middleware.proof_of_authority import ExtraDataToPOAMiddleware

    def _inject_poa_middleware(web3: Web3) -> None:
        try:
            web3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        except ValueError:
            pass


@dataclass(frozen=True)
class BlockchainConfig:
    """Configuration describing the deployed smart contract."""

    network: str
    contract_address: str
    abi: list
    rpc_url: Optional[str] = None
    admin_private_key: Optional[str] = None


class BlockchainService:
    """High-level helper bound to a deployed EvidenceLog contract."""

    def __init__(
        self,
        web3: Web3,
        contract_address: str,
        abi: list,
        admin_private_key: str,
        records_collection: Collection,
        chain_collection: Optional[Collection] = None,
        network_label: str = "ganache",
    ) -> None:
        self.web3 = web3
        self.contract = web3.eth.contract(address=contract_address, abi=abi)
        self.admin_account = Account.from_key(admin_private_key)
        self.records = records_collection
        self.chain_collection = chain_collection
        self.network_label = network_label

    # ------------------------------------------------------------------
    # Static helpers
    # ------------------------------------------------------------------
    @staticmethod
    def load_config(config_path: str) -> BlockchainConfig:
        if not os.path.exists(config_path):
            raise RuntimeError(
                f"Blockchain configuration not found at {config_path}. Run `npm run deploy` in the blockchain folder."
            )

        with open(config_path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)

        contract_address = payload.get("contractAddress")
        abi = payload.get("abi")
        network = payload.get("network", "ganache")
        rpc_url = payload.get("rpcUrl") or payload.get("rpc_url")
        admin_private_key = payload.get("adminPrivateKey") or payload.get("admin_private_key")

        if not contract_address or not abi:
            raise RuntimeError("Contract address or ABI missing in blockchain config")

        return BlockchainConfig(
            network=network,
            contract_address=contract_address,
            abi=abi,
            rpc_url=rpc_url,
            admin_private_key=admin_private_key,
        )

    @staticmethod
    def connect(url: str) -> Web3:
        provider = Web3.HTTPProvider(url)
        web3 = Web3(provider)
        if not web3.is_connected():
            raise RuntimeError(f"Unable to connect to blockchain node at {url}")

        # Ganache / Hardhat style local chains may need the POA middleware for timestamps.
        _inject_poa_middleware(web3)
        return web3

    # ------------------------------------------------------------------
    # Internal transaction helpers
    # ------------------------------------------------------------------
    def _build_transaction(self, function, sender: str, *args) -> Dict[str, Any]:
        """Build and sign a transaction for the provided contract function."""

        base_transaction = {
            "from": sender,
            "nonce": self.web3.eth.get_transaction_count(sender),
            "chainId": self.web3.eth.chain_id,
        }
        transaction = function(*args).build_transaction(base_transaction)

        # Configure fee fields, preferring EIP-1559 style when base fee is available.
        latest_block = {}
        try:
            latest_block = self.web3.eth.get_block("latest")
        except Exception:
            latest_block = {}

        base_fee = latest_block.get("baseFeePerGas")
        if base_fee is not None:
            # Dynamic-fee (EIP-1559) transaction
            try:
                priority_fee = getattr(self.web3.eth, "max_priority_fee", None)
                if callable(priority_fee):
                    priority_fee_value = priority_fee()
                else:
                    priority_fee_value = None
            except Exception:
                priority_fee_value = None

            if priority_fee_value is None:
                priority_fee_value = self.web3.to_wei("2", "gwei")

            max_fee = int(base_fee + priority_fee_value * 2)
            transaction.pop("gasPrice", None)
            transaction.setdefault("maxPriorityFeePerGas", priority_fee_value)
            transaction.setdefault("maxFeePerGas", max_fee)
        else:
            gas_price = transaction.get("gasPrice") or getattr(self.web3.eth, "gas_price", None)
            if gas_price is None:
                gas_price = self.web3.to_wei("2", "gwei")
            transaction["gasPrice"] = gas_price

        if not transaction.get("gas"):
            try:
                estimate = self.web3.eth.estimate_gas({k: v for k, v in transaction.items() if k != "nonce"})
                transaction["gas"] = int(estimate * 1.2)
            except ValueError:
                transaction["gas"] = 1_200_000

        return transaction

    def _send_transaction(self, transaction: Dict[str, Any], private_key: str) -> Dict[str, Any]:
        signed_txn = self.web3.eth.account.sign_transaction(transaction, private_key=private_key)

        raw_tx = getattr(signed_txn, "rawTransaction", None)
        if raw_tx is None:
            raw_tx = getattr(signed_txn, "raw_transaction", None)
        if raw_tx is None and isinstance(signed_txn, dict):  # compatibility
            raw_tx = signed_txn.get("rawTransaction") or signed_txn.get("raw_transaction")
        if raw_tx is None:
            raise RuntimeError("Signed transaction payload missing raw transaction bytes")

        tx_hash = self.web3.eth.send_raw_transaction(raw_tx)
        receipt = self.web3.eth.wait_for_transaction_receipt(tx_hash)
        return {
            "transaction_hash": tx_hash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "status": receipt.status,
            "timestamp": int(time.time()),
        }

    # ------------------------------------------------------------------
    # Public contract operations
    # ------------------------------------------------------------------
    def ensure_investigator(self, account: str) -> None:
        if not account:
            return

        try:
            checksum = Web3.to_checksum_address(account)
        except ValueError:
            return

        if checksum == Web3.to_checksum_address("0x0000000000000000000000000000000000000000"):
            return

        try:
            allowed = self.contract.functions.isInvestigator(checksum).call()
        except Exception as exc:  # pragma: no cover - Web3 error handling
            raise RuntimeError(f"Unable to query investigator status for {account}: {exc}") from exc

        if allowed:
            return

        transaction = self._build_transaction(
            self.contract.functions.setInvestigator,
            self.admin_account.address,
            checksum,
            True,
        )
        self._send_transaction(transaction, self.admin_account.key)

    def anchor_evidence(
        self,
        ledger_id: str,
        file_hash: str,
        description: str,
        uploader: str,
        *,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            print(f"Starting anchor_evidence for ledger_id: {ledger_id}, uploader: {uploader}")
            
            # 1. Verify connection to Ganache
            if not self.web3.is_connected():
                raise RuntimeError("Not connected to Ganache. Please ensure Ganache is running at http://127.0.0.1:7545")

            # 2. Normalise uploader address and ensure investigator role
            try:
                uploader_checksum = Web3.to_checksum_address(uploader)
            except (TypeError, ValueError):
                uploader_checksum = None

            zero_address = Web3.to_checksum_address("0x0000000000000000000000000000000000000000")
            if not uploader_checksum or uploader_checksum == zero_address:
                uploader_checksum = self.admin_account.address
                print(f"Invalid or zero uploader supplied; defaulting to admin account {uploader_checksum}")

            print("Ensuring uploader is an investigator...")
            self.ensure_investigator(uploader_checksum)

            # 3. Convert inputs to the correct format
            id_bytes = Web3.to_bytes(hexstr=ledger_id)
            hash_bytes = Web3.to_bytes(hexstr=file_hash)

            # 4. Check admin account balance
            admin_balance = self.web3.eth.get_balance(self.admin_account.address)
            print(f"Admin account balance: {Web3.from_wei(admin_balance, 'ether')} ETH")
            
            if admin_balance < self.web3.to_wei(0.01, 'ether'):
                raise RuntimeError(f"Admin account has insufficient balance: {Web3.from_wei(admin_balance, 'ether')} ETH")

            # 5. Build and send transaction
            print("Building transaction...")
            transaction = self._build_transaction(
                self.contract.functions.createEvidence,
                self.admin_account.address,  # Always use admin as sender
                id_bytes,
                hash_bytes,
                description,
            )

            print("Sending transaction...")
            receipt = self._send_transaction(transaction, private_key=self.admin_account.key)
            print(f"Transaction successful! Hash: {receipt['transaction_hash']}")

            # 6. Prepare and save payload
            payload = {
                "ledger_id": ledger_id,
                "evidence_id": reference_id or ledger_id,
                "file_hash": file_hash,
                "description": description,
                "transaction_hash": receipt["transaction_hash"],
                "block_number": receipt["block_number"],
                "uploader_address": uploader_checksum,
                "gas_used": receipt["gas_used"],
                "blockchain_timestamp": receipt["timestamp"],
                "verification_status": "anchored",
                "network": self.network_label,
                "created_at": time.time(),
            }

            self.records.insert_one(payload)
            self._append_chain_of_custody(payload)
            print("Evidence successfully anchored and recorded!")
            return payload

        except Exception as e:
            error_msg = f"Failed to anchor evidence: {str(e)}"
            print(error_msg)
            print(f"Error type: {type(e).__name__}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(error_msg) from e

    def get_evidence(self, ledger_id: str) -> Dict[str, Any]:
        id_bytes = Web3.to_bytes(hexstr=ledger_id)
        record = self.contract.functions.getEvidence(id_bytes).call()
        return {
            "id": Web3.to_hex(record[0]),
            "fileHash": Web3.to_hex(record[1]),
            "creator": record[2],
            "currentOwner": record[3],
            "description": record[4],
            "timestamp": record[5],
            "removed": record[6],
        }

    def verify_evidence(
        self,
        ledger_id: str,
        local_hash: str,
        *,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        onchain = self.get_evidence(ledger_id)
        verified = onchain["fileHash"].lower() == local_hash.lower()

        payload = {
            "ledger_id": ledger_id,
            "evidence_id": reference_id or ledger_id,
            "verified": verified,
            "onchain_hash": onchain["fileHash"],
            "local_hash": local_hash,
            "block_number": onchain.get("blockNumber"),
            "blockchain_timestamp": onchain.get("timestamp"),
            "network": self.network_label,
            "action": "verify",
            "created_at": time.time(),
        }
        self.records.insert_one(payload)
        self._append_chain_of_custody(payload)
        return payload

    def anchor_explanation(self, evidence_id: str, explanation_hash: str) -> Dict[str, Any]:
        if not evidence_id or not explanation_hash:
            raise ValueError("evidence_id and explanation_hash are required")

        self.ensure_investigator(self.admin_account.address)

        transaction = self._build_transaction(
            self.contract.functions.anchorExplanation,
            self.admin_account.address,
            evidence_id,
            explanation_hash,
        )
        receipt = self._send_transaction(transaction, private_key=self.admin_account.key)

        payload = {
            "evidence_id": evidence_id,
            "explanation_hash": explanation_hash,
            "transaction_hash": receipt["transaction_hash"],
            "block_number": receipt["block_number"],
            "gas_used": receipt["gas_used"],
            "blockchain_timestamp": receipt["timestamp"],
            "network": self.network_label,
            "action": "xai_anchor",
            "created_at": time.time(),
        }

        self.records.insert_one(payload)
        self._append_chain_of_custody(payload)
        return payload

    def transfer_evidence(
        self,
        ledger_id: str,
        new_owner: str,
        caller_key: str,
        *,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        id_bytes = Web3.to_bytes(hexstr=ledger_id)
        caller = Account.from_key(caller_key)

        transaction = self._build_transaction(
            self.contract.functions.transferEvidence,
            caller.address,
            id_bytes,
            Web3.to_checksum_address(new_owner),
        )
        receipt = self._send_transaction(transaction, private_key=caller.key)

        payload = {
            "ledger_id": ledger_id,
            "evidence_id": reference_id or ledger_id,
            "transaction_hash": receipt["transaction_hash"],
            "block_number": receipt["block_number"],
            "from": caller.address,
            "to": new_owner,
            "gas_used": receipt["gas_used"],
            "network": self.network_label,
            "blockchain_timestamp": receipt["timestamp"],
            "action": "transfer",
            "created_at": time.time(),
        }
        self.records.insert_one(payload)
        self._append_chain_of_custody(payload)
        return payload

    def remove_evidence(
        self,
        ledger_id: str,
        caller_key: Optional[str] = None,
        *,
        reference_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        id_bytes = Web3.to_bytes(hexstr=ledger_id)
        signer = Account.from_key(caller_key) if caller_key else self.admin_account

        transaction = self._build_transaction(self.contract.functions.removeEvidence, signer.address, id_bytes)
        receipt = self._send_transaction(transaction, private_key=signer.key)

        payload = {
            "ledger_id": ledger_id,
            "evidence_id": reference_id or ledger_id,
            "transaction_hash": receipt["transaction_hash"],
            "block_number": receipt["block_number"],
            "gas_used": receipt["gas_used"],
            "network": self.network_label,
            "blockchain_timestamp": receipt["timestamp"],
            "action": "remove",
            "created_at": time.time(),
        }
        self.records.insert_one(payload)
        self._append_chain_of_custody(payload)
        return payload

    # ------------------------------------------------------------------
    # Chain of custody helpers
    # ------------------------------------------------------------------
    def _append_chain_of_custody(self, payload: Dict[str, Any]) -> None:
        if self.chain_collection is None:
            return
        document = {
            "evidence_id": payload.get("evidence_id"),
            "action": payload.get("action") or payload.get("verification_status"),
            "transaction_hash": payload.get("transaction_hash"),
            "block_number": payload.get("block_number"),
            "network": payload.get("network"),
            "blockchain_timestamp": payload.get("blockchain_timestamp"),
            "details": payload,
            "created_at": payload.get("created_at", time.time()),
        }
        self.chain_collection.insert_one(document)


@lru_cache(maxsize=1)
def _load_blockchain_config() -> BlockchainConfig:
    config_path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "blockchain.json")
    return BlockchainService.load_config(config_path)


def init_blockchain_service(records_collection: Collection, chain_collection: Optional[Collection] = None) -> BlockchainService:
    config = _load_blockchain_config()

    ganache_url = os.getenv("GANACHE_URL") or config.rpc_url or "http://127.0.0.1:7545"
    private_key = os.getenv("GANACHE_PRIVATE_KEY") or config.admin_private_key
    if not private_key:
        raise RuntimeError(
            "GANACHE_PRIVATE_KEY must be set in backend/.env or provided via blockchain config (adminPrivateKey)."
        )

    web3 = BlockchainService.connect(ganache_url)

    env_contract = os.getenv("CONTRACT_ADDRESS")
    candidate_addresses = []
    if env_contract:
        candidate_addresses.append(env_contract)
    if config.contract_address and (not env_contract or env_contract.lower() != config.contract_address.lower()):
        candidate_addresses.append(config.contract_address)

    resolved_address = None
    invalid_addresses = []
    for raw_address in candidate_addresses:
        try:
            contract_address = Web3.to_checksum_address(raw_address)
        except ValueError:
            invalid_addresses.append(raw_address)
            continue

        code = web3.eth.get_code(contract_address)
        if code and code not in (b"", b"\x00"):
            resolved_address = contract_address
            break

    if not resolved_address:
        details = []
        if invalid_addresses:
            details.append(
                "Invalid contract addresses provided: " + ", ".join(invalid_addresses)
            )
        if candidate_addresses:
            details.append(
                "No bytecode found at: " + ", ".join(candidate_addresses)
            )
        hint = "Redeploy using `npm run deploy` while Ganache is running."
        message = "Configured contract address has no bytecode. " + " ".join(details + [hint])
        raise RuntimeError(message)

    return BlockchainService(
        web3=web3,
        contract_address=resolved_address,
        abi=config.abi,
        admin_private_key=private_key,
        records_collection=records_collection,
        chain_collection=chain_collection,
        network_label=config.network,
    )
