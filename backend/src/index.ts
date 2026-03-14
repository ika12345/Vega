import dotenv from "dotenv";
// Load environment variables FIRST before any other imports
dotenv.config();

import express from "express";
import cors from "cors";
import agentsRouter from "./api/agents";
import executionsRouter from "./api/executions";
import analyticsRouter from "./api/analytics";
import logsRouter from "./api/logs";
import chatRouter from "./api/chat";
import healthRouter from "./api/health";
import vvsSwapRouter from "./api/vvs-swap";
import fundingRouter from "./api/funding";
import { initializeFacilitator } from "./x402/facilitator";
import { apiRateLimit } from "./middleware/rateLimit";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    "https://agent-market-teal.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001"
  ],
  credentials: true
}));
app.use(express.json({ limit: "10mb" })); // Limit request body size

// Health check endpoints (no rate limiting)
app.use("/api/health", healthRouter);

// Apply rate limiting to all API routes
app.use("/api", apiRateLimit);

app.use("/api/agents", agentsRouter);
app.use("/api/executions", executionsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/logs", logsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/vvs-swap", vvsSwapRouter);
app.use("/api/funding", fundingRouter);

// Initialize x402 facilitator on server startup
async function startServer() {
  try {
    console.log("Initializing x402 facilitator...");
    await initializeFacilitator();
    console.log("✅ x402 facilitator initialized");
  } catch (error) {
    console.error("⚠️  Failed to initialize x402 facilitator:", error);
    console.error("⚠️  Payment features may not work correctly");
  }

  app.listen(PORT, () => {
    console.log(`OneChat backend running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api/agents`);
  });
}

startServer();
