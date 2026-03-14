import { Router, Request, Response } from "express";
import { executeAgent } from "../agent-engine/executor";
import { db } from "../lib/database";
import { validateAgentInputMiddleware, validateAgentCreation } from "../middleware/validation";
import { agentExecutionRateLimit, apiRateLimit } from "../middleware/rateLimit";
import { verifySolanaTransaction } from "../utils/solana";

const router = Router();

// Mock agents for the demo - updated to handle Solana public keys
const MOCK_AGENTS = [
  {
    id: 1,
    name: "Solana Contract Auditor",
    description: "Audits Anchor and native Solana smart contracts for safety",
    price: 0.10,
    reputation: 920,
    developer: "4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9",
    totalExecutions: 245,
    successfulExecutions: 238,
  },
  {
    id: 2,
    name: "Pump.fun Sniper Assistant",
    description: "Analyzes new Solana tokens and checks for rug-pull signals",
    price: 0.05,
    reputation: 810,
    developer: "DYw8jR1n3vSzA3F1h8vSzA3F1h8vSzA3F1h8",
    totalExecutions: 1120,
    successfulExecutions: 1050,
  }
];

router.get("/", apiRateLimit, async (req: Request, res: Response) => {
  try {
    const dbAgents = db.getAgents();
    res.json({ agents: [...MOCK_AGENTS, ...dbAgents] });
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.id);
    const agent = MOCK_AGENTS.find(a => a.id === agentId) || db.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    res.json({ agent });
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

router.post("/register", async (req: Request, res: Response) => {
  const { name, description, price, signature, owner } = req.body;

  const validation = validateAgentCreation({ name, description, price });
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    // 1. Verify Solana transaction (Registration fee 0.01 SOL)
    console.log(`Verifying registration for ${name} with signature ${signature}`);
    // We expect >= 0.01 SOL (10,000,000 lamports)
    const verification = await verifySolanaTransaction(signature, 10000000);

    if (!verification.valid) {
      return res.status(400).json({ error: "Registration fee verification failed", details: verification.error });
    }

    // 2. Add to local DB (persistent for this session)
    const newAgent = {
      id: Date.now(),
      name: validation.sanitized.name,
      description: validation.sanitized.description,
      price: validation.sanitized.price,
      reputation: 500,
      developer: owner || verification.payer,
      totalExecutions: 0,
      successfulExecutions: 0,
      onChainSignature: signature,
      network: 'solana-devnet'
    };

    db.addAgent(newAgent);
    console.log(`✅ Agent registered: ${newAgent.name}`);

    res.json({ success: true, agent: newAgent });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Failed to register agent" });
  }
});

router.post("/:id/execute", agentExecutionRateLimit, validateAgentInputMiddleware, async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.id);
    const { input, paymentHash } = req.body;
    const signature = req.headers["x-solana-signature"] as string || paymentHash;

    if (!input || !signature) {
      return res.status(400).json({ error: "Input and signature required" });
    }

    const agent = MOCK_AGENTS.find(a => a.id === agentId) || db.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // 1. Verify Solana payment transfer
    console.log(`Verifying execution payment for ${agent.name} with signature ${signature}`);
    const verification = await verifySolanaTransaction(signature);

    if (!verification.valid) {
      return res.status(402).json({ error: "Payment verification failed", details: verification.error });
    }

    // 2. Execute agent with AI
    console.log("Executing agent with AI...");
    const result = await executeAgent(agentId, input);
    
    // 3. Update Metrics
    db.updateAgentMetrics(agentId, result.success);

    // 4. Log execution
    db.addExecution({
      executionId: Date.now(),
      agentId,
      agentName: agent.name,
      userId: verification.payer || "unknown",
      paymentHash: signature,
      input,
      output: result.output || "",
      success: result.success,
      timestamp: Date.now(),
      verified: true, // We verified the signature
    });

    res.json({
      executionId: Date.now(),
      agentId,
      output: result.output,
      success: result.success,
      payerAddress: verification.payer,
      signature: signature
    });
  } catch (error) {
    console.error("Error executing agent:", error);
    res.status(500).json({ error: "Failed to execute agent" });
  }
});

export default router;


