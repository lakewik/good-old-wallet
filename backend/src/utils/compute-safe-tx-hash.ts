import { SafeTx } from "../services/x402";
import { keccak256, AbiCoder, solidityPacked } from "ethers";

// Minimal Safe contract ABI
export const SAFE_ABI = [
    "function getOwners() view returns (address[])",
    "function getThreshold() view returns (uint256)",
    "function nonce() view returns (uint256)",
    "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool success)",
  ];
  
/**
 * Compute Safe transaction hash locally (no contract call needed)
 * This replicates what Safe's getTransactionHash does on-chain
 */
export function computeSafeTransactionHash(
    safeAddress: string,
    safeTx: SafeTx,
    chainId: number
  ): string {
    // Safe uses EIP-712 domain separator
    const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
      Buffer.from("EIP712Domain(uint256 chainId,address verifyingContract)")
    );
  
    const domainSeparator = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "uint256", "address"],
        [DOMAIN_SEPARATOR_TYPEHASH, chainId, safeAddress]
      )
    );
  
    // Safe transaction typehash
    const SAFE_TX_TYPEHASH = keccak256(
      Buffer.from(
        "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"
      )
    );
  
    // Hash the Safe transaction data
    const safeTxHash = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        [
          "bytes32",
          "address",
          "uint256",
          "bytes32",
          "uint8",
          "uint256",
          "uint256",
          "uint256",
          "address",
          "address",
          "uint256",
        ],
        [
          SAFE_TX_TYPEHASH,
          safeTx.to,
          safeTx.value,
          keccak256(safeTx.data),
          safeTx.operation,
          safeTx.safeTxGas,
          safeTx.baseGas,
          safeTx.gasPrice,
          safeTx.gasToken,
          safeTx.refundReceiver,
          safeTx.nonce,
        ]
      )
    );
  
    // Final hash with EIP-191 prefix
    return keccak256(
      solidityPacked(
        ["bytes1", "bytes1", "bytes32", "bytes32"],
        ["0x19", "0x01", domainSeparator, safeTxHash]
      )
    );
  }
  