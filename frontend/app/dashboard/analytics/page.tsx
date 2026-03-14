"use client";

import { useState, useEffect } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import TetrisLoading from "@/components/ui/tetris-loader";
import Link from "next/link";
import { ArrowLeft, DollarSign, Activity, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { useAgents } from "@/hooks/useAgents";

interface AgentAnalytics {
  agentId: number;
  agentName: string;
  stats: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    revenue: string;
    successRate: string;
    reputation: number;
    price: number;
  };
}

export default function AnalyticsPage() {
  const { agents } = useAgents();
  const [analytics, setAnalytics] = useState<Record<number, AgentAnalytics>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllAnalytics();
  }, [agents]);

  const fetchAllAnalytics = async () => {
    if (agents.length === 0) {
      setLoading(false);
      return;
    }

    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const promises = agents.map((agent) =>
        fetch(`${apiUrl}/api/analytics/agents/${agent.id}`)
          .then((res) => res.json())
          .then((data) => ({ agentId: agent.id, data }))
          .catch((err) => {
            console.error(`Error fetching analytics for agent ${agent.id}:`, err);
            return null;
          })
      );

      const results = await Promise.all(promises);
      const analyticsMap: Record<number, AgentAnalytics> = {};

      results.forEach((result) => {
        if (result && result.data) {
          analyticsMap[result.agentId] = result.data;
        }
      });

      setAnalytics(analyticsMap);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <TetrisLoading size="md" speed="normal" loadingText="Loading analytics..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-sm border-b border-neutral-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                  Agent Analytics
                </h1>
                <p className="text-sm text-neutral-400 mt-1">
                  Detailed performance metrics for each agent
                </p>
              </div>
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {agents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-neutral-500">No agents available</p>
          </div>
        ) : (
          <div className="space-y-6">
            {agents.map((agent) => {
              const agentAnalytics = analytics[agent.id];
              const stats = agentAnalytics?.stats;

              return (
                <div
                  key={agent.id}
                  className="bg-neutral-900 rounded-lg border border-neutral-800 p-6"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">{agent.name}</h2>
                      <p className="text-sm text-neutral-400">{agent.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/agents/${agent.id}/analytics`}
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
                      >
                        View Analytics
                      </Link>
                      <Link
                        href={`/agents/${agent.id}`}
                        className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors"
                      >
                        View Agent
                      </Link>
                    </div>
                  </div>

                  {stats ? (
                    <>
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-neutral-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Activity className="h-4 w-4 text-neutral-500" />
                            <span className="text-xs text-neutral-500">Total Executions</span>
                          </div>
                          <div className="text-2xl font-bold">{stats.totalExecutions}</div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-xs text-neutral-500">Successful</span>
                          </div>
                          <div className="text-2xl font-bold text-green-500">
                            {stats.successfulExecutions}
                          </div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span className="text-xs text-neutral-500">Failed</span>
                          </div>
                          <div className="text-2xl font-bold text-red-500">
                            {stats.failedExecutions}
                          </div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="h-4 w-4 text-green-500" />
                            <span className="text-xs text-neutral-500">Revenue</span>
                          </div>
                          <div className="text-2xl font-bold text-green-500">
                            ${stats.revenue}
                          </div>
                        </div>
                      </div>

                      {/* Additional Metrics */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-neutral-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="h-4 w-4 text-neutral-500" />
                            <span className="text-xs text-neutral-500">Success Rate</span>
                          </div>
                          <div className="text-xl font-bold">{stats.successRate}%</div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-neutral-500">Reputation</span>
                          </div>
                          <div className="text-xl font-bold">{stats.reputation}/1000</div>
                        </div>

                        <div className="bg-neutral-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-neutral-500">Price per Execution</span>
                          </div>
                          <div className="text-xl font-bold">${stats.price.toFixed(2)}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-neutral-500">
                      <p>No analytics data available for this agent</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
