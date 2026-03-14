"use client";

import { useState, useEffect } from "react";

export interface Agent {
  id: number;
  developer: string;
  name: string;
  description: string;
  pricePerExecution: bigint;
  totalExecutions: bigint;
  successfulExecutions: bigint;
  reputation: bigint;
  active: boolean;
}

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAgents();
    // Refetch every 10 seconds
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAgents = async () => {
    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const response = await fetch(`${apiUrl}/api/agents`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      
      const mapped = (data.agents || []).map((a: any) => ({
        id: a.id,
        developer: a.developer || a.owner || "unknown",
        name: a.name,
        description: a.description,
        pricePerExecution: BigInt(Math.round((a.price || 0.01) * 1_000_000)),
        totalExecutions: BigInt(a.totalExecutions || 0),
        successfulExecutions: BigInt(a.successfulExecutions || 0),
        reputation: BigInt(a.reputation || 100),
        active: a.active !== false,
      }));
      
      setAgents(mapped);
    } catch (error) {
      console.error("Error fetching agents:", error);
    } finally {
      setLoading(false);
    }
  };

  return { agents, loading };
}

export function useAgent(agentId: number) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (agentId <= 0) return;
    
    const fetchAgent = async () => {
      try {
        let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
          apiUrl = apiUrl.replace("localhost", window.location.hostname);
        }
        const response = await fetch(`${apiUrl}/api/agents/${agentId}`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();
        
        if (data) {
          setAgent({
            id: data.id,
            developer: data.developer || data.owner || "unknown",
            name: data.name,
            description: data.description,
            pricePerExecution: BigInt(Math.round((data.price || 0.01) * 1_000_000)),
            totalExecutions: BigInt(data.totalExecutions || 0),
            successfulExecutions: BigInt(data.successfulExecutions || 0),
            reputation: BigInt(data.reputation || 100),
            active: data.active !== false,
          });
        }
      } catch (error) {
        console.error("Error fetching agent:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAgent();
    const interval = setInterval(fetchAgent, 5000);
    return () => clearInterval(interval);
  }, [agentId]);

  const refetch = async () => {
    // Trigger re-render
    setLoading(true);
  };

  return { agent, loading, refetch };
}
