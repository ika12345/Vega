import { Router, Request, Response } from "express";
import { verifyPayment, settlePayment, generatePaymentRequiredResponse } from "../x402/facilitator";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { executeAgent } from "../agent-engine/executor";
import { getAllAgentsFromContract, getAgentFromContract, executeAgentOnContract, verifyExecutionOnContract, releasePaymentToDeveloper } from "../lib/contract";
import { db } from "../lib/database";
import { ethers } from "ethers";
import { validateAgentInputMiddleware, validateAgentCreation } from "../middleware/validation";
import { agentExecutionRateLimit, apiRateLimit } from "../middleware/rateLimit";

const router = Router();

router.get("/", apiRateLimit, async (req: Request, res: Response) => {
  try {
    // Always return hardcoded default agents
    // The frontend will merge these with contract agents
    const agents = [
      {
        id: 1,
        name: "Smart Contract Analyzer",
        description: "Analyzes Solidity contracts for vulnerabilities and security issues",
        price: 0.10,
        reputation: 725,
      },
      {
        id: 2,
        name: "Market Data Agent",
        description: "Fetches and analyzes Crypto.com market data and price trends",
        price: 0.05,
        reputation: 500,
      },
      {
        id: 3,
        name: "Content Generator",
        description: "Creates marketing content for Web3 projects",
        price: 0.02,
        reputation: 1000,
      },
      {
        id: 4,
        name: "Portfolio Analyzer",
        description: "Analyzes DeFi portfolios and suggests optimization strategies",
        price: 0.15,
        reputation: 500,
      },
    ];

    res.json({ agents });
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.id);
    
    // Try to fetch from contract first
    const contractAgent = await getAgentFromContract(agentId);
    if (contractAgent) {
      return res.json({
        agent: {
          id: contractAgent.id,
          name: contractAgent.name,
          description: contractAgent.description,
          price: Number(contractAgent.pricePerExecution) / 1_000_000,
          reputation: Number(contractAgent.reputation),
          developer: contractAgent.developer,
          totalExecutions: Number(contractAgent.totalExecutions),
          successfulExecutions: Number(contractAgent.successfulExecutions),
        },
      });
    }

    // Fallback to hardcoded agent if contract not deployed
    const agent = {
      id: agentId,
      name: "Smart Contract Analyzer",
      description: "Analyzes Solidity contracts for vulnerabilities",
      price: 0.10,
      reputation: 850,
      developer: "0x...",
      totalExecutions: 150,
      successfulExecutions: 128,
    };

    res.json({ agent });
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

router.post("/:id/execute", agentExecutionRateLimit, validateAgentInputMiddleware, async (req: Request, res: Response) => {
  try {
    console.log("=== Agent Execution Request ===");
    console.log("Agent ID:", req.params.id);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    console.log("Payment headers:", {
      "x-payment": req.headers["x-payment"] ? "present" : "missing",
      "x-payment-signature": req.headers["x-payment-signature"] ? "present" : "missing",
      "payment-signature": req.headers["payment-signature"] ? "present" : "missing",
    });

    const agentId = parseInt(req.params.id);
    
    // Validate agent ID
    if (isNaN(agentId) || agentId <= 0) {
      return res.status(400).json({ error: "Invalid agent ID" });
    }
    
    const { input, paymentHash } = req.body;

    if (!input) {
      return res.status(400).json({ error: "Input required" });
    }

    // Get agent details from contract
    console.log("Fetching agent from contract...");
    const contractAgent = await getAgentFromContract(agentId);
    if (!contractAgent) {
      console.log("Agent not found in contract");
      return res.status(404).json({ error: "Agent not found" });
    }
    
    const agentPrice = Number(contractAgent.pricePerExecution) / 1_000_000; // Convert from 6 decimals to USD
    const escrowAddress = process.env.AGENT_ESCROW_ADDRESS || "0x4352F2319c0476607F5E1cC9FDd568246074dF14";
    console.log("💰 Payment Verification Details:", {
      agentPrice: `${agentPrice} USD`,
      escrowAddress,
      envVar: process.env.AGENT_ESCROW_ADDRESS || "using fallback",
      agentId,
    });

    // Check for payment header (Cronos docs use X-PAYMENT, but we also support X-PAYMENT-SIGNATURE for compatibility)
    const paymentHeader = req.headers["x-payment"] || 
                          req.headers["x-payment-signature"] || 
                          req.headers["payment-signature"];
    console.log("Payment header present:", !!paymentHeader, "Payment hash in body:", !!paymentHash);

    if (!paymentHash && !paymentHeader) {
      console.log("No payment provided, generating payment requirements...");
      
      // Return 402 with payment requirements (now async)
      try {
        const paymentRequired = await generatePaymentRequiredResponse({
          url: req.url || "",
          description: `Execute agent ${agentId}`,
          priceUsd: agentPrice,
          payTo: escrowAddress,
          testnet: true,
        });
        return res.status(402).json({
          error: "Payment required",
          paymentRequired: paymentRequired,
        });
      } catch (error) {
        console.error("Error generating payment requirements:", error);
        return res.status(500).json({
          error: "Failed to generate payment requirements",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Parse payment signature from headers
    console.log("Parsing payment signature...");
    
    // Extract payment header directly (can be string or string[])
    // Cronos docs use X-PAYMENT, but we also support X-PAYMENT-SIGNATURE for compatibility
    const paymentHeaderValue = req.headers["x-payment"] || 
                               req.headers["x-payment-signature"] || 
                               req.headers["payment-signature"];
    const headerString = Array.isArray(paymentHeaderValue) 
      ? paymentHeaderValue[0] 
      : paymentHeaderValue;
    
    if (!headerString || typeof headerString !== "string") {
      console.log("No payment header found");
      return res.status(402).json({
        error: "Payment signature header missing",
        paymentRequired: true,
      });
    }
    
    let paymentPayload;
    try {
      // Decode the payment signature header directly
      paymentPayload = decodePaymentSignatureHeader(headerString);
      console.log("Payment payload decoded successfully");
    } catch (parseError) {
      console.error("Payment parsing error:", parseError);
      return res.status(402).json({
        error: "Invalid payment signature format",
        details: parseError instanceof Error ? parseError.message : String(parseError),
      });
    }
    
    if (!paymentPayload) {
      console.log("Payment payload is null");
      return res.status(402).json({
        error: "Invalid payment signature",
        paymentRequired: true,
      });
    }
    console.log("Payment payload parsed successfully");

    // Verify payment
    console.log("Verifying payment...");
    let verification;
    try {
      // Pass the original payment header to preserve the signature
      verification = await verifyPayment(paymentPayload, {
        priceUsd: agentPrice,
        payTo: escrowAddress,
        testnet: true,
      }, headerString);
    } catch (verifyError) {
      console.error("Payment verification error:", verifyError);
      return res.status(402).json({
        error: "Payment verification failed",
        details: verifyError instanceof Error ? verifyError.message : String(verifyError),
      });
    }

    if (!verification.valid) {
      console.log("Payment verification failed:", verification.invalidReason);
      return res.status(402).json({
        error: verification.invalidReason || "Payment verification failed",
        paymentRequired: true,
      });
    }
    console.log("Payment verified successfully");

    // Convert paymentHash to bytes32 format if it's a hex string
    let paymentHashBytes32: string;
    if (paymentHash && paymentHash.startsWith("0x")) {
      paymentHashBytes32 = paymentHash;
    } else if (paymentPayload && 'hash' in paymentPayload && paymentPayload.hash) {
      paymentHashBytes32 = paymentPayload.hash as string;
    } else {
      // Generate a hash from the payment header
      paymentHashBytes32 = ethers.keccak256(ethers.toUtf8Bytes(headerString || ""));
    }

    // Step 1: Call executeAgent on contract to create execution record (OPTIONAL - needs TCRO for gas)
    console.log("Calling executeAgent on contract...");
    let contractExecutionId: number | null = null;
    try {
      contractExecutionId = await executeAgentOnContract(agentId, paymentHashBytes32, input);
      if (contractExecutionId !== null) {
        console.log(`✅ Execution record created on contract with executionId: ${contractExecutionId}`);
      } else {
        console.warn("⚠️ executeAgent() on contract returned null - running in off-chain mode (backend wallet needs TCRO for gas)");
      }
    } catch (contractError) {
      console.warn("⚠️ Contract call failed (likely no TCRO for gas) - continuing with off-chain execution:", contractError);
    }
    
    // Log payment to database
    db.addPayment({
      paymentHash: paymentHashBytes32,
      agentId,
      agentName: contractAgent.name,
      userId: verification.payerAddress || "unknown",
      amount: agentPrice,
      status: "pending",
      timestamp: Date.now(),
      executionId: contractExecutionId || 0,
    });
    
    // Step 2: Execute agent with AI (always runs, regardless of contract status)
    console.log("Executing agent with AI...");
    const result = await executeAgent(agentId, input);
    console.log("Agent execution result:", { success: result.success, outputLength: result.output?.length });
    
    // Log execution to database
    db.addExecution({
      executionId: contractExecutionId || Date.now(),
      agentId,
      agentName: contractAgent.name,
      userId: verification.payerAddress || "unknown",
      paymentHash: paymentHashBytes32,
      input,
      output: result.output || "",
      success: result.success,
      timestamp: Date.now(),
      verified: false,
    });

    // Step 3: Verify execution on contract (optional - only if step 1 succeeded)
    if (contractExecutionId !== null) {
      console.log("Calling verifyExecution on contract...");
      try {
        const verified = await verifyExecutionOnContract(
          contractExecutionId,
          result.output || "",
          result.success
        );
        if (verified) {
          console.log("✅ Execution verified on contract - metrics updated!");
          db.updateExecution(contractExecutionId, { verified: true });
        }
      } catch (verifyError) {
        console.warn("⚠️ verifyExecution on contract failed (non-critical):", verifyError);
      }
    }

    // Step 4: Settlement (optional)
    if (result.success) {
      console.log("✅ Agent execution successful - attempting settlement...");
      try {
        await settlePayment(paymentPayload, {
          priceUsd: agentPrice,
          payTo: escrowAddress,
          testnet: true,
        }, headerString);
        console.log("✅ Payment settled to escrow successfully");
        
        if (contractExecutionId !== null) {
          try {
            const released = await releasePaymentToDeveloper(paymentHashBytes32, agentId);
            if (released) {
              console.log("✅ Payment released to developer successfully");
            }
            db.updatePayment(paymentHashBytes32, { status: "settled" });
          } catch (releaseError) {
            console.warn("⚠️ Release to developer failed (non-critical):", releaseError);
            db.updatePayment(paymentHashBytes32, { status: "settled" });
          }
        }
      } catch (settleError) {
        console.warn("⚠️ Payment settlement failed (non-critical):", settleError);
        db.updatePayment(paymentHashBytes32, { status: "failed" });
      }
    } else {
      console.log("⚠️ Agent execution failed - payment NOT settled");
      db.updatePayment(paymentHashBytes32, { status: "refunded" });
    }

    res.json({
      executionId: contractExecutionId || Date.now(),
      agentId,
      output: result.output,
      success: result.success,
      payerAddress: verification.payerAddress,
    });
  } catch (error) {
    console.error("Error executing agent:", error);
    console.error("Error details:", error instanceof Error ? error.stack : error);
    
    // Import error handler
    const { sendErrorResponse } = require("../utils/errorHandler");
    sendErrorResponse(
      res,
      error,
      "Failed to execute agent",
      500
    );
  }
});

export default router;


