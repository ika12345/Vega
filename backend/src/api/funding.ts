import { Router, Request, Response } from "express";
import { FundingService } from "../services/funding";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

// Initialize Gemini (used for the "Nullshot AI Agent" persona)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * GET /api/funding/preflight
 * Get the current funding status for an address
 */
router.get("/preflight", async (req: Request, res: Response) => {
  try {
    const address = req.query.address as string;
    if (!address) {
      return res.status(400).json({ error: "Address is required" });
    }

    const status = await FundingService.getStatus(address);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/funding/chat
 * Interact with the Nullshot Funding Assistant Agent
 */
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { input, address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: "Address is required for the Funding Assistant" });
    }

    // 1. Get real-time status from our Service (which simulates our MCP tool)
    const status = await FundingService.getStatus(address);
    const faucetLinks = FundingService.getFaucetLinks();

    // 2. Build the Agentic Prompt (Nullshot Persona)
    const prompt = `
      You are the Nullshot Funding Assistant, an intelligent AI agent designed to help users onboard to the ElectroVault platform.
      
      User's Current Wallet Status (${address}):
      - TCRO Balance: ${status.balances.tcro} (Min required: ${status.requirements.minTcro})
      - devUSDC.e Balance: ${status.balances.usdc} (Min required: ${status.requirements.minUsdc})
      - Network: Cronos Testnet (Chain 338)
      - Status Ready: ${status.status.isReady ? "YES" : "NO"}
      
      Helpful Resources:
      ${faucetLinks.map(f => `- ${f.name}: ${f.url} (${f.description})`).join("\n")}
      
      User wants to know: "${input}"
      
      Guidelines:
      - Be helpful, encouraging, and brief.
      - If they are missing funds, explain WHY they need them (gas vs payments).
      - Provide direct instructions on how to use the faucets.
      - Mention that you are powered by Nullshot AI and the Model Context Protocol.
      - Keep the tone "premium" and "hacker-friendly".
      
      Response:
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    res.json({
      output: responseText,
      status: status,
      agentName: "Nullshot Assistant"
    });

  } catch (error: any) {
    console.error("Funding Agent Error:", error);
    res.status(500).json({ error: "Funding Assistant is temporarily unavailable." });
  }
});

export default router;
