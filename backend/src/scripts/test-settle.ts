/**
 * Test Script: Create Safe, Sign Transaction, Test /settle Endpoint
 *
 * This script:
 * 1. Uses your EOA wallet
 * 2. Creates a Safe with your EOA as the only owner (1-of-1)
 * 3. Funds the Safe with tokens
 * 4. Signs a token transfer transaction
 * 5. Sends it to the /settle endpoint (which EXECUTES the transaction on-chain)
 * 6. Displays the transaction hash and block number
 *
 * ⚠️  IMPORTANT:
 * - This ACTUALLY EXECUTES the transaction on-chain!
 * - Requires FACILITATOR_PRIVATE_KEY to be set (wallet that pays gas)
 * - The facilitator wallet needs native tokens (xDAI) for gas
 */

import Safe from '@safe-global/protocol-kit';
import { OperationType } from '@safe-global/safe-core-sdk-types';
import { formatEther, Interface, Contract, Wallet } from 'ethers';
import '../setup/config.js'; // Load environment variables
import { providers } from '../setup/providers.js';
import { ChainId, CHAINS } from '../index.js';
import { ERC20_ABI } from '../utils/decode-and-verify-erc20-transfer.js';

// Types for API response
interface SettleResponse {
  settled: boolean;
  txHash?: string;
  blockNumber?: string;
  reason?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // ===== CUSTOMIZE THESE VALUES =====

  // Chain to test on (currently only Gnosis supported for X402)
  CHAIN_ID: ChainId.GNOSIS,

  // Receiver address (who receives the payment)
  RECEIVER_ADDRESS: '0xde9fdc19f1469d50684d968390de2887c34708cf',

  // Token to transfer (ERC20 address)
  TOKEN_ADDRESS: '0x572E3a2d12163D8FACCF5385Ce363D152EA3A33E', // mock token

  // Transfer amount: 0.01 tokens (18 decimals)
  // 0.01 * 10^18 = 10000000000000000
  TRANSFER_AMOUNT: '10000000000000000', // 0.01 tokens

  // Amount to fund Safe: 0.1 tokens (should be > TRANSFER_AMOUNT)
  // 0.1 * 10^18 = 100000000000000000
  FUNDING_AMOUNT: '100000000000000000', // 0.1 tokens

  // Server endpoint
  SETTLE_ENDPOINT: 'http://localhost:7001/settle',
};

// ============================================================================
// Helper Functions
// ============================================================================

function encodeTransferData(receiver: string, amount: string): string {
  const iface = new Interface(ERC20_ABI);
  return iface.encodeFunctionData("transfer", [receiver, amount]);
}

// ============================================================================
// Main Script
// ============================================================================

async function main() {
  console.log('\n🚀 Starting Safe Transaction Settlement Test Script\n');
  console.log('='.repeat(80));
  console.log('⚠️  WARNING: This script will EXECUTE a real transaction on-chain!');
  console.log('='.repeat(80));

  // Validate environment
  if (!process.env.BACKEND_PRIVATE_KEY) {
    throw new Error('❌ BACKEND_PRIVATE_KEY not set in .env file');
  }

  if (!process.env.FACILITATOR_PRIVATE_KEY) {
    throw new Error(
      '❌ FACILITATOR_PRIVATE_KEY not set in .env file\n' +
      '   The facilitator wallet pays the gas fees for executing the transaction.\n' +
      '   Make sure it has native tokens (xDAI on Gnosis) for gas!'
    );
  }

  // Step 1: Setup EOA wallet using existing providers
  console.log('\n📝 Step 1: Setting up EOA wallet...');

  const provider = providers[CONFIG.CHAIN_ID];
  const chainConfig = CHAINS[CONFIG.CHAIN_ID];
  const ownerWallet = new Wallet(process.env.BACKEND_PRIVATE_KEY!, provider);

  console.log(`✅ EOA Address: ${ownerWallet.address}`);
  console.log(`   Network: ${chainConfig.name}`);

  const balance = await provider!.getBalance(ownerWallet.address);
  console.log(`   Native Balance: ${formatEther(balance)} ${chainConfig.native.symbol}`);

  // Check facilitator wallet balance
  const facilitatorWallet = new Wallet(process.env.FACILITATOR_PRIVATE_KEY!, provider);
  const facilitatorBalance = await provider!.getBalance(facilitatorWallet.address);
  console.log(`\n   Facilitator Address: ${facilitatorWallet.address}`);
  console.log(`   Facilitator Native Balance: ${formatEther(facilitatorBalance)} ${chainConfig.native.symbol}`);

  if (facilitatorBalance === 0n) {
    throw new Error(
      `❌ Facilitator wallet has no ${chainConfig.native.symbol}!\n` +
      `   The facilitator needs native tokens to pay gas fees.\n` +
      `   Please send some ${chainConfig.native.symbol} to ${facilitatorWallet.address}`
    );
  }

  // Check token balance
  const tokenContract = new Contract(CONFIG.TOKEN_ADDRESS, ERC20_ABI, ownerWallet);
  const tokenBalance = await tokenContract.balanceOf(ownerWallet.address);

  // Get token info
  const tokenSymbol = await tokenContract.symbol();
  const tokenDecimals = await tokenContract.decimals();

  console.log(`\n   Token: ${tokenSymbol} (${CONFIG.TOKEN_ADDRESS})`);
  console.log(`   Token Balance: ${formatEther(tokenBalance)} ${tokenSymbol}`);

  // Step 2: Setup Safe SDK
  console.log('\n📝 Step 2: Setting up Safe SDK...');

  let safe: Safe;
  let safeAddress: string;

  // Get RPC URL for the chain
  const rpcUrl = process.env[`RPC_${chainConfig.name.toUpperCase().replace(' ', '_')}`] ||
                 process.env.RPC_GNOSIS;

  if (!rpcUrl) {
    throw new Error(`❌ RPC URL not configured for ${chainConfig.name}`);
  }

  // Step 3: Deploy a FRESH Safe (with nonce 0) for this test
  console.log('\n📝 Step 3: Deploying FRESH Safe (1-of-1 with your EOA)...');
  console.log('   🎲 Using random saltNonce for unique Safe address');

  // Use random saltNonce to create a unique Safe address each time
  // This ensures the Safe always starts with nonce 0
  const saltNonce = Math.floor(Math.random() * 1000000).toString();
  console.log(`   🔑 SaltNonce: ${saltNonce}`);

  // Create Safe instance with predicted address using saltNonce
  safe = await Safe.init({
    provider: rpcUrl,
    signer: process.env.BACKEND_PRIVATE_KEY!,
    predictedSafe: {
      safeAccountConfig: {
        owners: [ownerWallet.address],
        threshold: 1
      },
      safeDeploymentConfig: {
        saltNonce: saltNonce  // This makes each Safe unique!
      }
    }
  });

  safeAddress = await safe.getAddress();
  console.log(`   📍 New Safe Address: ${safeAddress}`);

  // Check if this Safe is already deployed (it shouldn't be with random salt)
  const code = await provider!.getCode(safeAddress);
  const isDeployed = code !== '0x';

  if (isDeployed) {
    console.log(`   ⚠️  Safe already exists (rare with random salt)`);
  } else {
    console.log(`   🚀 Deploying new Safe...`);
    console.log(`   ⏳ This may take a minute...`);

    // Deploy the Safe
    const deploymentTx = await safe.createSafeDeploymentTransaction();
    const txResponse = await ownerWallet.sendTransaction({
        to: deploymentTx.to,
        data: deploymentTx.data,
        value: deploymentTx.value
    });

    console.log(`   ⏳ Deploying Safe transaction: ${txResponse.hash}`);
    await txResponse.wait();
    console.log(`   ✅ Safe deployed successfully!`);
  }

  console.log(`\n   💡 NOTE: This Safe is FRESH with nonce 0 - no nonce conflicts!`);

  // Verify Safe configuration
  const owners = await safe.getOwners();
  const threshold = await safe.getThreshold();
  const currentNonce = await safe.getNonce();

  console.log(`\n📋 Safe Configuration:`);
  console.log(`   Address: ${safeAddress}`);
  console.log(`   Owners: ${owners.join(', ')}`);
  console.log(`   Threshold: ${threshold}`);
  console.log(`   Current Nonce: ${currentNonce}`);

  // Important: The Safe SDK will automatically use the current nonce when creating transactions
  console.log(`\n⚠️  NOTE: This transaction will use nonce ${currentNonce}`);

  // Check Safe's token balance BEFORE
  const safeTokenBalanceBefore = await tokenContract.balanceOf(safeAddress);
  console.log(`   Safe ${tokenSymbol} Balance (BEFORE): ${formatEther(safeTokenBalanceBefore)} ${tokenSymbol}`);

  // Step 4: Fund the Safe if needed
  console.log('\n📝 Step 4: Checking if Safe needs funding...');

  const requiredBalance = BigInt(CONFIG.TRANSFER_AMOUNT);
  if (safeTokenBalanceBefore < requiredBalance) {
    console.log(`   ⚠️  Safe has insufficient ${tokenSymbol} balance`);

    // Check if EOA has enough tokens
    if (tokenBalance < BigInt(CONFIG.FUNDING_AMOUNT)) {
      throw new Error(
        `❌ Insufficient ${tokenSymbol} in your wallet!\n` +
        `   Required: ${formatEther(CONFIG.FUNDING_AMOUNT)} ${tokenSymbol}\n` +
        `   Available: ${formatEther(tokenBalance)} ${tokenSymbol}\n` +
        `   Please get some ${tokenSymbol} tokens first.`
      );
    }

    console.log(`   📤 Transferring ${formatEther(CONFIG.FUNDING_AMOUNT)} ${tokenSymbol} to Safe...`);

    const fundTx = await tokenContract.transfer(safeAddress, CONFIG.FUNDING_AMOUNT);
    console.log(`   ⏳ Waiting for funding transaction: ${fundTx.hash}`);
    await fundTx.wait();

    const newBalance = await tokenContract.balanceOf(safeAddress);
    console.log(`   ✅ Safe funded! New balance: ${formatEther(newBalance)} ${tokenSymbol}`);
  } else {
    console.log(`   ✅ Safe has sufficient balance (${formatEther(safeTokenBalanceBefore)} ${tokenSymbol})`);
  }

  // Check receiver's balance BEFORE
  const receiverBalanceBefore = await tokenContract.balanceOf(CONFIG.RECEIVER_ADDRESS);
  console.log(`\n   Receiver ${tokenSymbol} Balance (BEFORE): ${formatEther(receiverBalanceBefore)} ${tokenSymbol}`);

  // Step 5: Encode transfer data
  console.log('\n📝 Step 5: Encoding token transfer...');

  const transferData = encodeTransferData(
    CONFIG.RECEIVER_ADDRESS,
    CONFIG.TRANSFER_AMOUNT
  );

  // Format amount for display based on decimals
  const displayAmount = Number(CONFIG.TRANSFER_AMOUNT) / Math.pow(10, Number(tokenDecimals));

  console.log(`   Token: ${tokenSymbol} (${CONFIG.TOKEN_ADDRESS})`);
  console.log(`   To: ${CONFIG.RECEIVER_ADDRESS}`);
  console.log(`   Amount: ${displayAmount} ${tokenSymbol}`);
  console.log(`   Data: ${transferData.slice(0, 66)}...`);

  // Step 6: Create Safe transaction
  console.log('\n📝 Step 6: Creating Safe transaction...');

  const safeTransaction = await safe.createTransaction({
    transactions: [{
      to: CONFIG.TOKEN_ADDRESS,
      value: '0',
      data: transferData,
      operation: OperationType.Call
    }]
  });

  console.log(`✅ Safe transaction created`);
  console.log(`   Transaction Nonce: ${safeTransaction.data.nonce}`);
  console.log(`   To: ${safeTransaction.data.to}`);
  console.log(`   Value: ${safeTransaction.data.value}`);

  // Step 7: Sign the transaction
  console.log('\n📝 Step 7: Signing transaction with EOA...');

  const signedTransaction = await safe.signTransaction(safeTransaction);

  console.log(`✅ Transaction signed!`);
  console.log(`   Signatures: ${signedTransaction.signatures.size} signature(s)`);

  // Step 8: Prepare payload for /settle endpoint
  console.log('\n📝 Step 8: Preparing payload for /settle endpoint...');

  // Extract signatures
  // IMPORTANT: Safe requires signatures to be sorted by signer address (ascending)
  const signaturesArray = Array.from(signedTransaction.signatures.values());

  // Sort by signer address (Safe requirement)
  const sortedSignatures = signaturesArray.sort((a, b) => {
    const addrA = a.signer.toLowerCase();
    const addrB = b.signer.toLowerCase();
    return addrA < addrB ? -1 : addrA > addrB ? 1 : 0;
  });

  console.log('   📝 Signature Details:');
  sortedSignatures.forEach((sig, idx) => {
    console.log(`     ${idx + 1}. Signer: ${sig.signer}`);
    console.log(`        Data: ${sig.data.substring(0, 66)}...`);
    console.log(`        Length: ${sig.data.length} chars`);
  });

  const concatenatedSignatures = sortedSignatures
    .map(sig => sig.data)
    .join('');

  const payload = {
    paymentPayload: {
      scheme: 'evm-safe-wcrc',
      networkId: chainConfig.id,
      safeAddress: safeAddress,
      safeTx: {
        from: ownerWallet.address,
        to: safeTransaction.data.to,
        value: safeTransaction.data.value,
        data: safeTransaction.data.data,
        operation: safeTransaction.data.operation,
        safeTxGas: safeTransaction.data.safeTxGas,
        baseGas: safeTransaction.data.baseGas,
        gasPrice: safeTransaction.data.gasPrice,
        gasToken: safeTransaction.data.gasToken,
        refundReceiver: safeTransaction.data.refundReceiver,
        nonce: safeTransaction.data.nonce.toString()
      },
      signatures: concatenatedSignatures
    },
  };

  console.log(`✅ Payload prepared`);
  console.log(`\n   📊 Payload Summary:`);
  console.log(`     Safe: ${safeAddress}`);
  console.log(`     Nonce: ${safeTransaction.data.nonce}`);
  console.log(`     Signatures: ${concatenatedSignatures.length} chars`);
  console.log(`     Sig Preview: ${concatenatedSignatures.substring(0, 66)}...${concatenatedSignatures.substring(concatenatedSignatures.length - 10)}`);

  // Step 9: Send to /settle endpoint
  console.log(`\n📝 Step 9: Sending to ${CONFIG.SETTLE_ENDPOINT}...`);
  console.log('⚠️  This will EXECUTE the transaction on-chain!');
  console.log('⏳ Please wait...\n');

  try {
    const response = await fetch(CONFIG.SETTLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = (await response.json()) as SettleResponse;

    console.log(`\n${'='.repeat(80)}`);
    console.log('📨 RESPONSE FROM /settle ENDPOINT');
    console.log('='.repeat(80));
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`\nBody:`);
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(80));

    if (result.settled) {
      console.log('\n✅ SUCCESS! Transaction executed on-chain!');
      console.log(`   Transaction Hash: ${result.txHash}`);
      console.log(`   Block Number: ${result.blockNumber}`);
      console.log(`   Explorer: https://gnosisscan.io/tx/${result.txHash}`);

      // Wait a bit for the transaction to be indexed
      console.log('\n⏳ Waiting for transaction to be indexed...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check balances AFTER
      const safeTokenBalanceAfter = await tokenContract.balanceOf(safeAddress);
      const receiverBalanceAfter = await tokenContract.balanceOf(CONFIG.RECEIVER_ADDRESS);

      console.log(`\n📊 Balance Changes:`);
      console.log(`   Safe ${tokenSymbol}:`);
      console.log(`     Before: ${formatEther(safeTokenBalanceBefore)}`);
      console.log(`     After:  ${formatEther(safeTokenBalanceAfter)}`);
      console.log(`     Change: ${formatEther(safeTokenBalanceAfter - safeTokenBalanceBefore)}`);

      console.log(`\n   Receiver ${tokenSymbol}:`);
      console.log(`     Before: ${formatEther(receiverBalanceBefore)}`);
      console.log(`     After:  ${formatEther(receiverBalanceAfter)}`);
      console.log(`     Change: +${formatEther(receiverBalanceAfter - receiverBalanceBefore)}`);

    } else {
      console.log('\n❌ SETTLEMENT FAILED!');
      console.log(`   Reason: ${result.reason}`);
    }

  } catch (error) {
    console.error('\n❌ Error calling /settle endpoint:');
    console.error(error);
  }

  console.log('\n🎉 Test script completed!\n');
}

// ============================================================================
// Run Script
// ============================================================================

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Script failed with error:');
    console.error(error);
    process.exit(1);
  });
