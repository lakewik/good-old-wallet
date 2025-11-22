import http from "http";
import { logger } from "../setup/logger.js";
import { x402Service, type EvmSafeWcrcPaymentPayload } from "../services/x402.js";

interface SettleRequest {
  paymentPayload: EvmSafeWcrcPaymentPayload;
}

/**
 * POST /settle
 * Executes the Safe transaction for payment settlement using X402 service
 * 
 * Expected request body:
 * {
 *   "paymentPayload": {
 *     "scheme": "evm-safe-wcrc",
 *     "networkId": 100,
 *     "safeAddress": "0x...",
 *     "safeTx": { ... },
 *     "signatures": "0x..."
 *   },
 * }
 * 
 * Returns 200 with X-PAYMENT-RESPONSE header
 */

// export async function handleSettleRequest(
//   req: http.IncomingMessage,
//   res: http.ServerResponse
// ): Promise<void> {
//   if (req.method !== "POST") {
//     res.writeHead(405, { "Content-Type": "application/json" });
//     res.end(
//       JSON.stringify({
//         error: "Method not allowed",
//         message: "Only POST requests are allowed for /settle",
//       })
//     );
//     return;
//   }

//   let body = "";
  
//   req.on("data", (chunk) => {
//     body += chunk.toString();
//   });

//   req.on("end", async () => {
//     try {
//       const data: SettleRequest = JSON.parse(body);
      
//       logger.info("Received settle request", {
//         safeAddress: data.paymentPayload?.safeAddress,
//         receiver: data.paymentDetails?.receiver,
//       });

//       // Call X402 service to settle payment
//       const result = await x402Service.settlePayment(
//         data.paymentPayload,
//         data.paymentDetails
//       );

//       if (!result.settled) {
//         res.writeHead(500, { "Content-Type": "application/json" });
//         res.end(JSON.stringify(result, null, 2));
//         return;
//       }

//       // Prepare payment response header
//       const paymentResponse = JSON.stringify({
//         settled: true,
//         txHash: result.txHash,
//         blockNumber: result.blockNumber,
//       });

//       // Return 200 with X-PAYMENT-RESPONSE header
//       res.writeHead(200, {
//         "Content-Type": "application/json",
//         "X-PAYMENT-RESPONSE": paymentResponse,
//       });
      
//       res.end(JSON.stringify(result, null, 2));
//     } catch (error) {
//       logger.error("Error settling payment", error);
      
//       if (error instanceof SyntaxError) {
//         res.writeHead(400, { "Content-Type": "application/json" });
//         res.end(
//           JSON.stringify({
//             settled: false,
//             reason: "Invalid JSON",
//           })
//         );
//       } else {
//         res.writeHead(500, { "Content-Type": "application/json" });
//         res.end(
//           JSON.stringify({
//             settled: false,
//             reason: error instanceof Error ? error.message : "Execution failed",
//           })
//         );
//       }
//     }
//   });

//   req.on("error", (error) => {
//     logger.error("Request error", error);
//     res.writeHead(500, { "Content-Type": "application/json" });
//     res.end(
//       JSON.stringify({
//         settled: false,
//         reason: error.message,
//       })
//     );
//   });
// }

