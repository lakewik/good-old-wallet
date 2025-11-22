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
  │   └── orchestrator.ts # Main orchestration logic
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

- `GET /health` - Health check endpoint
- `GET /get-summarized-amounts/:address` - Get balance summary across all chains for an address

Example:
```bash
curl http://localhost:7000/get-summarized-amounts/0x742d35Cc6634C0532925a3b844Bc454e4438f44e
```

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
