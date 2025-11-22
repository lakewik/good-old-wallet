// Load environment variables
import dotenv from "dotenv";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "RPC_ETHEREUM",
  "RPC_ARBITRUM",
  "RPC_BASE",
  "RPC_OPTIMISM",
];

const missing = requiredEnvVars.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.warn(`Warning: Missing environment variables: ${missing.join(", ")}`);
  console.warn("Using default public RPC endpoints from .env file");
}
