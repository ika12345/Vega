"use client";

import { useState, useEffect } from "react";

export interface Execution {
  id: number;
  agentId: number;
  user: string;
  paymentHash: string;
  input: string;
  output: string;
  verified: boolean;
  timestamp: string; // From backend it's string/number
}

export function useExecutions(limit?: number) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchExecutions() {
      try {
        let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
          apiUrl = apiUrl.replace("localhost", window.location.hostname);
        }

        const url = new URL(`${apiUrl}/api/executions`);
        if (limit) url.searchParams.append("limit", limit.toString());

        const response = await fetch(url.toString());
        if (!response.ok) throw new Error("Failed to fetch executions");

        const data = await response.json();
        
        if (mounted) {
          setExecutions(data.executions || []);
        }
      } catch (error) {
        console.error("Error fetching executions:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchExecutions();
    const interval = setInterval(fetchExecutions, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [limit]);

  return { executions, loading };
}
