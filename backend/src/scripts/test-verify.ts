/**
 * Test Script: Create Safe, Sign Transaction, Test /verify Endpoint
 * 
 * This script:
 * 1. Uses your EOA wallet
 * 2. Creates a Safe with your EOA as the only owner (1-of-1)
 * 3. Funds the Safe with wCRC tokens
 * 4. Signs a wCRC transfer transaction
 * 5. Sends it to the /verify endpoint
 * 6. Displays the response
 */

import Safe from '@safe-global/protocol-kit';
import { OperationType } from '@safe-global/safe-core-sdk-types';
import { formatEther, Interface, Contract, Wallet } from 'ethers';
import '../setup/config.js'; // Load environment variables
import { providers } from '../setup/providers.js';
import { ChainId, CHAINS } from '../index.js';
import { ERC20_ABI } from '../utils/decode-and-verify-erc20-transfer.js';

// Types for API response
interface VerifyResponse {
  valid: boolean;
  reason?: string;
  meta?: {
    to: string;
    amount: string;
    token: string;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // ===== CUSTOMIZE THESE VALUES =====
  
  // Chain to test on (currently only Gnosis supported for X402)
  CHAIN_ID: ChainId.GNOSIS,
  
  // Receiver address (who receives the payment)
  // Using your backend wallet address for testing - change this to any address you want
  RECEIVER_ADDRESS:'0xde9fdc19f1469d50684d968390de2887c34708cf',
  
  // Token to transfer (ERC20 address)
  TOKEN_ADDRESS: '0x572E3a2d12163D8FACCF5385Ce363D152EA3A33E', // mock token
  
  // Transfer amount: 0.01 xDAI (18 decimals)
  // 0.01 * 10^18 = 10000000000000000
  TRANSFER_AMOUNT: '10000000000000000', // 0.01 xDAI
  
  // Amount to fund Safe: 0.1 xDAI (should be > TRANSFER_AMOUNT)
  // 0.1 * 10^18 = 100000000000000000
  FUNDING_AMOUNT: '100000000000000000', // 0.1 xDAI
  
  // Server endpoint
  VERIFY_ENDPOINT: 'http://localhost:3000/verify',
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
  console.log('\n🚀 Starting Safe Transaction Test Script\n');
  console.log('='.repeat(80));

  // Validate environment
  if (!process.env.BACKEND_PRIVATE_KEY) {
    throw new Error('❌ BACKEND_PRIVATE_KEY not set in .env file');
  }

  // Step 1: Setup EOA wallet using existing providers
  console.log('\n📝 Step 1: Setting up EOA wallet...');

  const provider = providers[CONFIG.CHAIN_ID];
  const chainConfig = CHAINS[CONFIG.CHAIN_ID];
  const ownerWallet = new Wallet(process.env.BACKEND_PRIVATE_KEY!, provider);
  
  console.log(`✅ EOA Address: ${ownerWallet.address}`);
  console.log(`   Network: ${chainConfig.name}`);
  
  const balance = await provider.getBalance(ownerWallet.address);
  console.log(`   Native Balance: ${formatEther(balance)} ${chainConfig.native.symbol}`);
  
  // Check token balance
  const tokenContract = new Contract(CONFIG.TOKEN_ADDRESS, ERC20_ABI, ownerWallet);
  const tokenBalance = await tokenContract.balanceOf(ownerWallet.address);
  
  // Get token info
  const tokenSymbol = await tokenContract.symbol();
  const tokenDecimals = await tokenContract.decimals();
  
  console.log(`   Token: ${tokenSymbol} (${CONFIG.TOKEN_ADDRESS})`);
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

  // Step 3: Get or deploy Safe
  console.log('\n📝 Step 3: Getting or deploying Safe (1-of-1 with your EOA)...');

  // Create Safe instance with predicted address
  safe = await Safe.init({
    provider: rpcUrl,
    signer: process.env.BACKEND_PRIVATE_KEY!,
    predictedSafe: {
      safeAccountConfig: {
        owners: [ownerWallet.address],
        threshold: 1
      }
    }
  });
    
  safeAddress = await safe.getAddress();
  console.log(`   📍 Predicted Safe Address: ${safeAddress}`);
  
  // Check if Safe is already deployed
  const code = await provider.getCode(safeAddress);
  const isDeployed = code !== '0x';
  
  if (isDeployed) {
    console.log(`   ✅ Safe already deployed - reusing existing Safe`);
  } else {
    console.log(`   🚀 Safe not deployed yet - deploying now...`);
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


  // Verify Safe configuration
  const owners = await safe.getOwners();
  const threshold = await safe.getThreshold();
  const nonce = await safe.getNonce();
  
  console.log(`\n📋 Safe Configuration:`);
  console.log(`   Address: ${safeAddress}`);
  console.log(`   Owners: ${owners.join(', ')}`);
  console.log(`   Threshold: ${threshold}`);
  console.log(`   Nonce: ${nonce}`);
  
  // Check Safe's token balance
  const safeTokenBalance = await tokenContract.balanceOf(safeAddress);
  console.log(`   Safe ${tokenSymbol} Balance: ${formatEther(safeTokenBalance)} ${tokenSymbol}`);

  // Step 4: Fund the Safe if needed
  console.log('\n📝 Step 4: Checking if Safe needs funding...');
  
  const requiredBalance = BigInt(CONFIG.TRANSFER_AMOUNT);
  if (safeTokenBalance < requiredBalance) {
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
    console.log(`   ✅ Safe has sufficient balance (${formatEther(safeTokenBalance)} ${tokenSymbol})`);
  }

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
  console.log(`   Transaction hash will be computed and signed...`);

  // Step 7: Sign the transaction
  console.log('\n📝 Step 7: Signing transaction with EOA...');
  
  const signedTransaction = await safe.signTransaction(safeTransaction);
  
  console.log(`✅ Transaction signed!`);
  console.log(`   Signatures: ${signedTransaction.signatures.size} signature(s)`);

  // Step 8: Prepare payload for /verify endpoint
  console.log('\n📝 Step 8: Preparing payload for /verify endpoint...');
  
  // Extract signatures
  const signaturesArray = Array.from(signedTransaction.signatures.values());
  const concatenatedSignatures = signaturesArray
    .map(sig => sig.data)
    .join('');

  const payload = {
    paymentPayload: {
      scheme: 'evm-safe-wcrc', // Note: Keep this for now, will be generic later
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
  console.log(`\n📦 Payload Preview:`);
  console.log(JSON.stringify(payload, null, 2));

  // Step 9: Send to /verify endpoint
  console.log(`\n📝 Step 9: Sending to ${CONFIG.VERIFY_ENDPOINT}...`);
  
  try {
    const response = await fetch(CONFIG.VERIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = (await response.json()) as VerifyResponse;

    console.log(`\n${'='.repeat(80)}`);
    console.log('📨 RESPONSE FROM /verify ENDPOINT');
    console.log('='.repeat(80));
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`\nBody:`);
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(80));

    if (result.valid) {
      console.log('\n✅ SUCCESS! Payment verification passed!');
      console.log(`   Receiver: ${result.meta?.to}`);
      console.log(`   Amount: ${result.meta?.amount}`);
      console.log(`   Token: ${result.meta?.token}`);
      console.log(`\n💡 Next: Test the /settle endpoint to actually execute the transaction`);
    } else {
      console.log('\n❌ VERIFICATION FAILED!');
      console.log(`   Reason: ${result.reason}`);
    }

  } catch (error) {
    console.error('\n❌ Error calling /verify endpoint:');
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
