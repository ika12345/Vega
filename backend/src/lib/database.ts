/**
 * Simple JSON file-based database for execution logs and agent registry
 */

import fs from "fs";
import path from "path";

const DB_DIR = path.join(process.cwd(), "data");
const EXECUTIONS_FILE = path.join(DB_DIR, "executions.json");
const PAYMENTS_FILE = path.join(DB_DIR, "payments.json");
const AGENTS_FILE = path.join(DB_DIR, "agents.json");

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export interface Agent {
  id: number;
  name: string;
  description: string;
  price: number;
  reputation: number;
  developer: string;
  totalExecutions: number;
  successfulExecutions: number;
  onChainSignature?: string;
  network?: string;
}

export interface ExecutionLog {
  executionId: number;
  agentId: number;
  agentName: string;
  userId: string;
  paymentHash: string;
  input: string;
  output: string;
  success: boolean;
  timestamp: number;
  verified: boolean;
}

export interface PaymentLog {
  paymentHash: string;
  agentId: number;
  agentName: string;
  userId: string;
  amount: number;
  status: "pending" | "settled" | "verified" | "failed" | "refunded";
  timestamp: number;
  executionId?: number;
  transactionHash?: string;
}

function readExecutions(): ExecutionLog[] {
  try {
    if (fs.existsSync(EXECUTIONS_FILE)) {
      const data = fs.readFileSync(EXECUTIONS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading executions file:", error);
  }
  return [];
}

function writeExecutions(executions: ExecutionLog[]): void {
  try {
    fs.writeFileSync(EXECUTIONS_FILE, JSON.stringify(executions, null, 2));
  } catch (error) {
    console.error("Error writing executions file:", error);
  }
}

function readPayments(): PaymentLog[] {
  try {
    if (fs.existsSync(PAYMENTS_FILE)) {
      const data = fs.readFileSync(PAYMENTS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading payments file:", error);
  }
  return [];
}

function writePayments(payments: PaymentLog[]): void {
  try {
    fs.writeFileSync(PAYMENTS_FILE, JSON.stringify(payments, null, 2));
  } catch (error) {
    console.error("Error writing payments file:", error);
  }
}

function readAgents(): Agent[] {
  try {
    if (fs.existsSync(AGENTS_FILE)) {
      const data = fs.readFileSync(AGENTS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading agents file:", error);
  }
  return [];
}

function writeAgents(agents: Agent[]): void {
  try {
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2));
  } catch (error) {
    console.error("Error writing agents file:", error);
  }
}

export const db = {
  // Agent Registry
  getAgents(): Agent[] {
    return readAgents();
  },

  getAgent(id: number): Agent | undefined {
    return readAgents().find(a => a.id === id);
  },

  addAgent(agent: Agent): void {
    const agents = readAgents();
    agents.push(agent);
    writeAgents(agents);
  },

  updateAgentMetrics(id: number, success: boolean): void {
    const agents = readAgents();
    const index = agents.findIndex(a => a.id === id);
    if (index !== -1) {
      agents[index].totalExecutions += 1;
      if (success) {
        agents[index].successfulExecutions += 1;
        // Increase reputation slightly on success
        agents[index].reputation = Math.min(1000, agents[index].reputation + 2);
      } else {
        // Decrease reputation slightly on failure
        agents[index].reputation = Math.max(0, agents[index].reputation - 5);
      }
      writeAgents(agents);
    }
  },

  // Execution logs
  addExecution(log: ExecutionLog): void {
    const executions = readExecutions();
    executions.push(log);
    writeExecutions(executions);
  },

  getExecutions(filters?: {
    agentId?: number;
    userId?: string;
    paymentHash?: string;
    startTime?: number;
    endTime?: number;
    success?: boolean;
  }): ExecutionLog[] {
    let executions = readExecutions();
    
    if (filters) {
      if (filters.agentId !== undefined) {
        executions = executions.filter((e) => e.agentId === filters.agentId);
      }
      if (filters.userId) {
        executions = executions.filter((e) => e.userId.toLowerCase() === filters.userId!.toLowerCase());
      }
      if (filters.paymentHash) {
        executions = executions.filter((e) => e.paymentHash.toLowerCase() === filters.paymentHash!.toLowerCase());
      }
      if (filters.startTime) {
        executions = executions.filter((e) => e.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        executions = executions.filter((e) => e.timestamp <= filters.endTime!);
      }
      if (filters.success !== undefined) {
        executions = executions.filter((e) => e.success === filters.success);
      }
    }
    
    return executions.sort((a, b) => b.timestamp - a.timestamp);
  },

  updateExecution(executionId: number, updates: Partial<ExecutionLog>): void {
    const executions = readExecutions();
    const index = executions.findIndex((e) => e.executionId === executionId);
    if (index !== -1) {
      executions[index] = { ...executions[index], ...updates };
      writeExecutions(executions);
    }
  },

  // Payment logs
  addPayment(log: PaymentLog): void {
    const payments = readPayments();
    payments.push(log);
    writePayments(payments);
  },

  getPayments(filters?: {
    agentId?: number;
    userId?: string;
    paymentHash?: string;
    status?: PaymentLog["status"];
    startTime?: number;
    endTime?: number;
  }): PaymentLog[] {
    let payments = readPayments();
    
    if (filters) {
      if (filters.agentId !== undefined) {
        payments = payments.filter((p) => p.agentId === filters.agentId);
      }
      if (filters.userId) {
        payments = payments.filter((p) => p.userId.toLowerCase() === filters.userId!.toLowerCase());
      }
      if (filters.paymentHash) {
        payments = payments.filter((p) => p.paymentHash.toLowerCase() === filters.paymentHash!.toLowerCase());
      }
      if (filters.status) {
        payments = payments.filter((p) => p.status === filters.status);
      }
      if (filters.startTime) {
        payments = payments.filter((p) => p.timestamp >= filters.startTime!);
      }
      if (filters.endTime) {
        payments = payments.filter((p) => p.timestamp <= filters.endTime!);
      }
    }
    
    return payments.sort((a, b) => b.timestamp - a.timestamp);
  },

  updatePayment(paymentHash: string, updates: Partial<PaymentLog>): void {
    const payments = readPayments();
    const index = payments.findIndex((p) => p.paymentHash === paymentHash);
    if (index !== -1) {
      payments[index] = { ...payments[index], ...updates };
      writePayments(payments);
    }
  },
};
