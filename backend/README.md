## Project Structure

```
src/
  ├── setup/              # Configuration and initialization
  │   ├── config.ts       # Environment configuration loader
  │   ├── logger.ts       # Logging utility
  │   ├── types.ts        # Type definitions and interfaces
  │   ├── chains.ts       # Chain configurations
  │   └── providers.ts    # Ethereum providers setup
  ├── handlers/           # Business logic handlers
  │   ├── balances.ts     # Balance query functions
  │   └── gas.ts          # Gas estimation utilities
  ├── services/           # Service layer
  │   ├── orchestrator.ts # Main orchestration logic
  │   └── x402.ts         # X402 payment protocol service
  ├── routes/             # API route handlers
  │   ├── assets.ts       # Assets balance endpoint
  │   ├── verify.ts       # Payment verification endpoint
  │   ├── settle.ts       # Payment settlement endpoint
  │   └── index.ts        # Route exports
  ├── index.ts            # Library entry point (exports all modules)
  ├── server.ts           # HTTP API server entry point
  └── example.ts          # Example usage and demonstrations
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Environment variables:
   - The `.env` file is already configured with public RPC endpoints
   - You can override these by setting your own RPC URLs in the `.env` file:
```
RPC_ETHEREUM=your_ethereum_rpc_url
RPC_ARBITRUM=your_arbitrum_rpc_url
RPC_BASE=your_base_rpc_url
RPC_OPTIMISM=your_optimism_rpc_url
LOG_LEVEL=info  # Optional: debug, info, warn, error (default: info)
USE_MOCK_BALANCES=false  # Set to "true" to use mock balances instead of RPC
```

3. Build the project:
```bash
npm run build
```

4. Run in development mode:

**As a library (for programmatic usage):**
```bash
npm run dev
```

**As an HTTP API server:**
```bash
npm run dev:server
```

The application has two entry points:
- `index.ts`: Library exports for programmatic usage
- `server.ts`: Standalone HTTP API server

## Usage

### Programmatic Usage

The orchestrator provides two main scenarios:

1. **Single Chain Selection**: Find the best chain to send USDC from if you have enough on one chain
2. **Multi-Chain Split**: Split a USDC transfer across multiple chains if needed

See `example.ts` for detailed usage examples.

### HTTP API Usage

When running as a server (`npm run dev:server`), the following endpoints are available:

#### `GET /health`
Health check endpoint to verify server is running.

```bash
curl http://localhost:7000/health
```

#### `GET /assets/:address`
Get balance summary across all chains for an Ethereum address.

```bash
curl http://localhost:7000/assets/0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

#### `POST /verify`
Verify payment payload and signature using the X402 payment protocol.

**Request body:**
```json
{
  "paymentPayload": {
    "scheme": "evm-safe-wcrc",
    "networkId": 100,
    "safeAddress": "0x...",
    "safeTx": {
      "to": "0x...",
      "value": "0",
      "data": "0x...",
      "operation": 0,
      "safeTxGas": "0",
      "baseGas": "0",
      "gasPrice": "0",
      "gasToken": "0x0000000000000000000000000000000000000000",
      "refundReceiver": "0x0000000000000000000000000000000000000000",
      "nonce": "0"
    },
    "signatures": "0x..."
  },
  "paymentDetails": {
    "receiver": "0x...",
    "amount": "1000000"
  }
}
```

**Response:**
```json
{
  "valid": true,
  "meta": {
    "to": "0x...",
    "amount": "1000000",
    "token": "0x..."
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:7000/verify \
  -H "Content-Type: application/json" \
  -d @payment-verification.json
```

#### `POST /settle`
Execute Safe transaction for payment settlement using the X402 service.
Returns 200 with `X-PAYMENT-RESPONSE` header containing settlement details.

**Request body:** Same as `/verify`

**Response:**
```json
{
  "settled": true,
  "txHash": "0x...",
  "blockNumber": "12345678"
}
```

**Response Headers:**
- `X-PAYMENT-RESPONSE`: JSON string with settlement result

**Example:**
```bash
curl -X POST http://localhost:7000/settle \
  -H "Content-Type: application/json" \
  -d @payment-settlement.json
```

## Architecture

### Service Layer

The application follows a clean architecture with separation of concerns:

- **Routes** (`/routes`): Handle HTTP requests/responses, input validation, and error handling
- **Services** (`/services`): Contain business logic and orchestration
- **Handlers** (`/handlers`): Perform specific operations (balances, gas estimation)
- **Setup** (`/setup`): Configuration, logging, and initialization

### X402 Payment Protocol

The X402 service (`services/x402.ts`) implements the payment verification and settlement protocol:

1. **Verification Flow**:
   - Validates payment scheme (`evm-safe-wcrc`)
   - Checks network ID (Gnosis Chain = 100)
   - Verifies Safe multisig signatures
   - Validates transfer recipient and amount

2. **Settlement Flow**:
   - Re-verifies payment (optional)
   - Builds Safe `execTransaction` call
   - Executes transaction on-chain
   - Waits for confirmation
   - Returns transaction receipt

**Note**: Current implementation contains TODOs for actual Safe integration. Replace placeholders with:
- `SafeVerifier` for signature verification
- `SafeTxBuilder` for transaction execution
- `viem` clients for blockchain interaction

## Features

- Multi-chain support (Ethereum, Arbitrum, Base, Optimism)
- Optimal gas cost calculation
- Balance checking across chains
- Split transfer planning
- Comprehensive logging system with configurable log levels
- Public RPC endpoints pre-configured
- Mock balance system for testing and development

## Logging

The project includes comprehensive logging throughout all modules. Log levels can be controlled via the `LOG_LEVEL` environment variable:

- `debug`: Detailed debugging information
- `info`: General informational messages (default)
- `warn`: Warning messages
- `error`: Error messages only

All logs include timestamps and structured data for easy debugging and monitoring.

## Mock Balances

The project includes a mock balance system for testing and development without making RPC calls.

### Enabling Mock Mode

Set `USE_MOCK_BALANCES=true` in your `.env` file to enable mock mode. When enabled, balance functions will check for mock balances first before falling back to RPC.

### Setting Mock Balances

```typescript
import {
  setMockBalance,
  setMockBalances,
  clearMockBalances,
  ChainId,
  NATIVE_TOKEN_ADDRESS
} from "./index.js";

// Set a single mock balance
setMockBalance(
  ChainId.ETHEREUM,
  "0x1234...", // wallet address
  NATIVE_TOKEN_ADDRESS, // or token address for ERC-20
  BigInt("1000000000000000000") // 1 ETH in wei
);

// Set multiple mock balances at once
setMockBalances([
  {
    chainId: ChainId.ETHEREUM,
    wallet: "0x1234...",
    tokenAddress: NATIVE_TOKEN_ADDRESS,
    balance: BigInt("1000000000000000000"), // 1 ETH
  },
  {
    chainId: ChainId.ARBITRUM_ONE,
    wallet: "0x1234...",
    tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
    balance: BigInt("100000000"), // 100 USDC (6 decimals)
  },
]);

// Clear all mock balances
clearMockBalances();
```

### Behavior

- When mock mode is enabled and a mock balance is set, it will be returned immediately
- If mock mode is enabled but no mock balance is found, it falls back to RPC with a warning
- When mock mode is disabled, all balance queries go directly to RPC
- Mock balances are stored in memory and persist for the lifetime of the application
