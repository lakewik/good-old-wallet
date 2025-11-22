# EIL Gas Sponsorship Scenario

## Scenario
- User has ETH (gas) only on Ethereum L1
- User has NO ETH (gas) on Base
- Plan requires:
  - Send 200 USDC from Ethereum L1 → Ethereum L1
  - Send 150 USDC from Base → Base

## Can EIL Help?

**YES, EIL can help in this situation through multiple mechanisms:**

### 1. **Paymaster Gas Sponsorship**
EIL paymasters can sponsor gas fees for UserOperations on chains where the user has no native token. The Base paymaster can pay for the gas on the Base transaction.

**How it works:**
- EIL uses ERC-4337 Account Abstraction
- Paymasters can sponsor UserOperations
- The paymaster on Base can cover the gas costs
- Payment can be made in tokens (like USDC) or through vouchers

### 2. **Voucher System (Cross-Chain Gas Transfer)**
EIL can use its voucher system to move ETH from L1 to Base first, then use that ETH for gas.

**How it works:**
- Create a voucher request on L1 to move ETH to Base
- XLPs (Cross-Layer Providers) fulfill the voucher
- The ETH arrives on Base and can be used for gas
- Then execute the USDC transfer on Base

### 3. **Atomic Multi-Chain Execution**
EIL can coordinate both transactions in a single signed batch:
- One signature covers both chains
- Both transactions execute atomically
- If one fails, the entire batch can be reverted (depending on configuration)

## Implementation Strategy

### Option A: Paymaster Sponsorship (Simpler)
```typescript
// EIL paymaster on Base sponsors the gas
// User pays for sponsorship (in USDC or other tokens)
const baseBatch = builder.startBatch(BigInt(8453)); // Base
baseBatch.addAction(transferAction); // USDC transfer
// Paymaster will sponsor gas - no ETH needed on Base
```

### Option B: Voucher-Based Gas Transfer (More Complex)
```typescript
// Step 1: Create voucher to move ETH from L1 to Base
const l1Batch = builder.startBatch(BigInt(1)); // Ethereum
l1Batch.addVoucherRequest({
  destinationChainId: BigInt(8453), // Base
  asset: { token: nativeToken, amount: gasAmount },
});

// Step 2: Use the voucher on Base
const baseBatch = builder.startBatch(BigInt(8453)); // Base
baseBatch.useVoucher(voucherRefId); // Get ETH from voucher
baseBatch.addAction(transferAction); // USDC transfer
```

## Automatic Paymaster Configuration

The `buildEILPayload()` function automatically ensures paymaster configuration is present:

- **Automatic Detection**: If `sourcePaymaster` is missing from config, it's automatically added
- **ChainInfo Enhancement**: If `paymasterAddress` is missing from ChainInfo entries, it's added from EIL deployment.json
- **Fallback Addresses**: Uses known EIL deployment addresses as fallback if deployment.json can't be loaded

This means you don't need to manually configure paymasters - they're added automatically when building the payload.

## Considerations

1. **Paymaster Funding**: The paymaster must be funded to sponsor transactions
2. **Payment Method**: Paymaster may require payment in tokens (USDC) or through vouchers
3. **Gas Costs**: Even with sponsorship, there may be fees associated with the paymaster service
4. **Voucher Fees**: Using vouchers may have fees paid to XLPs
5. **Automatic Configuration**: Paymaster addresses are automatically added if missing - no manual configuration needed

## Recommendation

For this scenario, **Option A (Paymaster Sponsorship)** is recommended because:
- Simpler implementation
- No need to move ETH between chains
- Faster execution (no voucher wait time)
- Lower complexity

The user can pay for the Base transaction gas sponsorship using USDC or other tokens they hold.
