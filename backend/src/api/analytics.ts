import { Router, Request, Response } from "express";
import { db } from "../lib/database";

const router = Router();

/**
 * Get platform-wide analytics
 */
router.get("/platform", async (req: Request, res: Response) => {
  try {
    const agents = db.getAgents();
    const executions = db.getExecutions();
    
    // Calculate platform stats
    const totalAgents = agents.length;
    const totalExecutions = executions.length;
    const totalSuccessfulExecutions = executions.filter(e => e.success).length;
    
    // Revenue in SOL (0.01 SOL per execution for demo)
    const totalRevenue = totalSuccessfulExecutions * 0.01;
    
    const successRate = totalExecutions > 0 
      ? (totalSuccessfulExecutions / totalExecutions) * 100 
      : 0;

    res.json({
      stats: {
        totalAgents,
        totalExecutions,
        totalSuccessfulExecutions,
        totalRevenue: totalRevenue.toFixed(2),
        successRate: successRate.toFixed(1),
        network: "Solana Devnet"
      },
      agents: agents.map(agent => {
        const agentExecutions = executions.filter(e => e.agentId === agent.id);
        const agentSuccess = agentExecutions.filter(e => e.success).length;
        return {
          id: agent.id,
          name: agent.name,
          executions: agentExecutions.length,
          successfulExecutions: agentSuccess,
          reputation: agent.reputation || 100,
          price: 0.01,
        }
      }),
    });
  } catch (error) {
    console.error("Error fetching platform analytics:", error);
    res.status(500).json({ 
      error: "Failed to fetch platform analytics",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Get analytics for a specific agent
 */
router.get("/agents/:id", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.id);
    const agent = db.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const executions = db.getExecutions({ agentId });
    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.success).length;
    const price = 0.01;
    const revenue = price * successfulExecutions;
    const successRate = totalExecutions > 0 
      ? (successfulExecutions / totalExecutions) * 100 
      : 0;

    res.json({
      agentId,
      agentName: agent.name,
      stats: {
        totalExecutions,
        successfulExecutions,
        failedExecutions: totalExecutions - successfulExecutions,
        revenue: revenue.toFixed(2),
        successRate: successRate.toFixed(1),
        reputation: agent.reputation || 100,
        price,
        network: agent.network || "solana"
      },
    });
  } catch (error) {
    console.error("Error fetching agent analytics:", error);
    res.status(500).json({ 
      error: "Failed to fetch agent analytics",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
