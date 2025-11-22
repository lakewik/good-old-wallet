import swaggerJsdoc from "swagger-jsdoc";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 7000;

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Abstracted Wallet API",
    version: "1.0.0",
    description: "API for managing multi-chain wallet operations, including balance queries and transaction planning",
    contact: {
      name: "API Support",
    },
  },
  servers: [
    {
      url: `http://localhost:${PORT}`,
      description: "Local development server",
    },
  ],
  tags: [
    {
      name: "Health",
      description: "Health check endpoints",
    },
    {
      name: "Assets",
      description: "Asset and balance management",
    },
    {
      name: "Planning",
      description: "Transaction planning and optimization",
    },
    {
      name: "Verification",
      description: "Transaction verification",
    },
    {
      name: "Settlement",
      description: "Transaction settlement",
    },
  ],
  components: {
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "string",
            description: "Error type",
          },
          message: {
            type: "string",
            description: "Error message",
          },
        },
        required: ["error"],
      },
      ChainBalance: {
        type: "object",
        properties: {
          chainId: {
            type: "number",
            description: "Chain ID",
            example: 1,
          },
          chainName: {
            type: "string",
            description: "Chain name",
            example: "Ethereum",
          },
          native: {
            type: "object",
            properties: {
              symbol: {
                type: "string",
                example: "ETH",
              },
              balance: {
                type: "string",
                description: "Balance in wei",
                example: "3500000000000000000",
              },
              balanceFormatted: {
                type: "string",
                description: "Human-readable balance",
                example: "3.5",
              },
            },
          },
          usdc: {
            type: "object",
            properties: {
              balance: {
                type: "string",
                description: "Balance in smallest unit (6 decimals)",
                example: "250000000",
              },
              balanceFormatted: {
                type: "string",
                description: "Human-readable balance",
                example: "250",
              },
            },
          },
        },
      },
      SummarizedAmountsResponse: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Wallet address",
            example: "0x13190e7028c5e7e70f87efe08a973c330b09f458",
          },
          chains: {
            type: "array",
            items: {
              $ref: "#/components/schemas/ChainBalance",
            },
          },
          totals: {
            type: "object",
            properties: {
              native: {
                type: "object",
                properties: {
                  totalWei: {
                    type: "string",
                    example: "5300000000000000000",
                  },
                  totalFormatted: {
                    type: "string",
                    example: "5.3",
                  },
                  symbol: {
                    type: "string",
                    example: "ETH",
                  },
                },
              },
              usdc: {
                type: "object",
                properties: {
                  totalSmallestUnit: {
                    type: "string",
                    example: "400000000",
                  },
                  totalFormatted: {
                    type: "string",
                    example: "400",
                  },
                },
              },
            },
          },
        },
      },
      PlanRequest: {
        type: "object",
        required: ["sourceAddress", "destinationAddress", "amount", "tokenName"],
        properties: {
          sourceAddress: {
            type: "string",
            description: "Source wallet address",
            example: "0x13190e7028c5e7e70f87efe08a973c330b09f458",
          },
          destinationAddress: {
            type: "string",
            description: "Destination wallet address",
            example: "0x0A088759743B403eFB2e2F766f77Ec961f185e0f",
          },
          amount: {
            type: "string",
            description: "Amount to send (human-readable format, e.g., '100.5')",
            example: "100.5",
          },
          tokenName: {
            type: "string",
            description: "Token name (currently only 'USDC' is supported)",
            example: "USDC",
            enum: ["USDC"],
          },
        },
      },
      SingleChainPlan: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["single"],
          },
          quote: {
            type: "object",
            properties: {
              chainId: {
                type: "number",
                example: 1,
              },
              chainName: {
                type: "string",
                example: "Ethereum",
              },
              gasCostUsdc: {
                type: "string",
                description: "Gas cost in USDC (smallest unit)",
                example: "5000000",
              },
            },
          },
        },
      },
      MultiChainPlan: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["multi"],
          },
          plan: {
            type: "object",
            properties: {
              legs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    chainId: {
                      type: "number",
                      example: 1,
                    },
                    chainName: {
                      type: "string",
                      example: "Ethereum",
                    },
                    amountUsdc: {
                      type: "string",
                      description: "Amount in USDC (smallest unit)",
                      example: "50000000",
                    },
                    gasCostUsdc: {
                      type: "string",
                      description: "Gas cost in USDC (smallest unit)",
                      example: "5000000",
                    },
                  },
                },
              },
              totalAmount: {
                type: "string",
                description: "Total amount in USDC (smallest unit)",
                example: "100000000",
              },
              totalGasCostUsdc: {
                type: "string",
                description: "Total gas cost in USDC (smallest unit)",
                example: "10000000",
              },
            },
          },
        },
      },
      PlanResponse: {
        type: "object",
        properties: {
          success: {
            type: "boolean",
            example: true,
          },
          plan: {
            oneOf: [
              { $ref: "#/components/schemas/SingleChainPlan" },
              { $ref: "#/components/schemas/MultiChainPlan" },
            ],
            nullable: true,
          },
          message: {
            type: "string",
            description: "Optional message (e.g., when no plan is found)",
            example: "No viable plan found. Insufficient balance across all chains.",
          },
        },
      },
    },
  },
};

const options: swaggerJsdoc.Options = {
  definition: swaggerDefinition,
  apis: [
    join(__dirname, "../routes/*.ts"),
    join(__dirname, "../server.ts"),
  ],
};

let swaggerSpec: any;

try {
  swaggerSpec = swaggerJsdoc(options);
  logger.info("Swagger specification generated successfully", {
    pathsCount: Object.keys(swaggerSpec.paths || {}).length,
  });
} catch (error) {
  logger.error("Failed to generate Swagger specification", error);
  // Return a minimal valid spec if generation fails
  swaggerSpec = {
    ...swaggerDefinition,
    paths: {},
  };
}

export { swaggerSpec };
