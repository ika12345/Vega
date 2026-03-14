"use client";

import { useState, useEffect } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import TetrisLoading from "@/components/ui/tetris-loader";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, DollarSign, Activity, TrendingUp, CheckCircle2, XCircle, Clock, BarChart3 } from "lucide-react";
import { useAgent } from "@/hooks/useAgents";

export default function AgentAnalyticsPage() {
  const params = useParams();
  const agentId = parseInt(params.id as string);
  const { agent, loading: contractLoading } = useAgent(agentId);
  const [analytics, setAnalytics] = useState<any>(null);
  const [timeStats, setTimeStats] = useState<{
    today: { executions: number; revenue: number };
    week: { executions: number; revenue: number };
    month: { executions: number; revenue: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (agentId) {
      fetchAnalytics();
      fetchTimeStats();
    }
  }, [agentId]);

  const fetchAnalytics = async () => {
    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const response = await fetch(`${apiUrl}/api/analytics/agents/${agentId}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Error fetching analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeStats = async () => {
    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const price = Number(agent?.pricePerExecution || 0) / 1_000_000;
      
      const [todayRes, weekRes, monthRes] = await Promise.all([
        fetch(`${apiUrl}/api/logs/executions?agentId=${agentId}&range=today`),
        fetch(`${apiUrl}/api/logs/executions?agentId=${agentId}&range=7d`),
        fetch(`${apiUrl}/api/logs/executions?agentId=${agentId}&range=30d`),
      ]);

      const todayData = todayRes.ok ? await todayRes.json() : { executions: [] };
      const weekData = weekRes.ok ? await weekRes.json() : { executions: [] };
      const monthData = monthRes.ok ? await monthRes.json() : { executions: [] };

      const todaySuccessful = todayData.executions.filter((e: any) => e.success).length;
      const weekSuccessful = weekData.executions.filter((e: any) => e.success).length;
      const monthSuccessful = monthData.executions.filter((e: any) => e.success).length;

      setTimeStats({
        today: {
          executions: todaySuccessful,
          revenue: todaySuccessful * price,
        },
        week: {
          executions: weekSuccessful,
          revenue: weekSuccessful * price,
        },
        month: {
          executions: monthSuccessful,
          revenue: monthSuccessful * price,
        },
      });
    } catch (error) {
      console.error("Error fetching time stats:", error);
    }
  };

  if (loading || contractLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <TetrisLoading size="md" speed="normal" loadingText="Loading analytics..." />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-black text-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-500">Agent not found</p>
          <Link href="/dashboard" className="text-neutral-400 hover:text-neutral-50 mt-4 inline-block">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const stats = analytics?.stats || {
    totalExecutions: Number(agent.totalExecutions),
    successfulExecutions: Number(agent.successfulExecutions),
    failedExecutions: Number(agent.totalExecutions) - Number(agent.successfulExecutions),
    revenue: (Number(agent.successfulExecutions) * Number(agent.pricePerExecution) / 1_000_000).toFixed(2),
    successRate: Number(agent.totalExecutions) > 0 
      ? ((Number(agent.successfulExecutions) / Number(agent.totalExecutions)) * 100).toFixed(1)
      : "0",
    reputation: Number(agent.reputation),
    price: Number(agent.pricePerExecution) / 1_000_000,
  };

  return (
    <div className="min-h-screen bg-black text-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-sm border-b border-neutral-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/analytics"
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                  {agent.name} Analytics
                </h1>
                <p className="text-sm text-neutral-400 mt-1">
                  Detailed performance metrics
                </p>
              </div>
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Total Executions</h3>
              <Activity className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-50">
              {stats.totalExecutions}
            </div>
            <p className="text-xs text-neutral-500 mt-1">All time</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Successful</h3>
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-green-500">
              {stats.successfulExecutions}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Completed</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Failed</h3>
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="text-3xl font-bold text-red-500">
              {stats.failedExecutions}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Errors</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Revenue</h3>
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-green-500">
              ${stats.revenue}
            </div>
            <p className="text-xs text-neutral-500 mt-1">SOL earned</p>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Success Rate</h3>
              <TrendingUp className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-2xl font-bold text-neutral-50">
              {stats.successRate}%
            </div>
            <p className="text-xs text-neutral-500 mt-1">Execution success</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Reputation</h3>
              <BarChart3 className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-2xl font-bold text-neutral-50">
              {stats.reputation}/1000
            </div>
            <p className="text-xs text-neutral-500 mt-1">On-chain score</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Price</h3>
              <DollarSign className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-2xl font-bold text-neutral-50">
              ${stats.price.toFixed(2)}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Per execution</p>
          </div>
        </div>

        {/* Time-based Trends */}
        {timeStats && (
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Time-based Trends</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-neutral-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm text-neutral-400">Today</h3>
                  <Clock className="h-4 w-4 text-neutral-500" />
                </div>
                <div className="text-2xl font-bold text-neutral-50 mb-1">
                  {timeStats.today.executions}
                </div>
                <div className="text-sm text-green-500">
                  ${timeStats.today.revenue.toFixed(2)} revenue
                </div>
              </div>
              <div className="bg-neutral-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm text-neutral-400">Last 7 Days</h3>
                  <TrendingUp className="h-4 w-4 text-neutral-500" />
                </div>
                <div className="text-2xl font-bold text-neutral-50 mb-1">
                  {timeStats.week.executions}
                </div>
                <div className="text-sm text-green-500">
                  ${timeStats.week.revenue.toFixed(2)} revenue
                </div>
              </div>
              <div className="bg-neutral-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm text-neutral-400">Last 30 Days</h3>
                  <BarChart3 className="h-4 w-4 text-neutral-500" />
                </div>
                <div className="text-2xl font-bold text-neutral-50 mb-1">
                  {timeStats.month.executions}
                </div>
                <div className="text-sm text-green-500">
                  ${timeStats.month.revenue.toFixed(2)} revenue
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <Link
            href={`/agents/${agentId}`}
            className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-50 transition-colors"
          >
            View Agent Page
          </Link>
          <Link
            href="/dashboard/analytics"
            className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-50 transition-colors"
          >
            All Agents Analytics
          </Link>
        </div>
      </div>
    </div>
  );
}
