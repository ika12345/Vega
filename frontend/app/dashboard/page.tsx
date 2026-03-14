"use client";

import { useState, useEffect, useMemo } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { useAgents } from "@/hooks/useAgents";
import { usePlatformStats } from "@/hooks/usePlatformStats";
import { useExecutions } from "@/hooks/useExecutions";
import TetrisLoading from "@/components/ui/tetris-loader";
import Link from "next/link";
import {
  DollarSign,
  Activity,
  TrendingUp,
  Bot,
  ArrowRight,
  BarChart3,
  CreditCard,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
} from "lucide-react";

interface PlatformStats {
  totalAgents: number;
  totalExecutions: number;
  totalSuccessfulExecutions: number;
  totalRevenue: string;
  successRate: string;
}

interface AgentStats {
  id: number;
  name: string;
  executions: number;
  successfulExecutions: number;
  reputation: number;
  price: number;
}

interface ActivityItem {
  type: "execution" | "payment";
  id: string | number;
  agentId: number;
  agentName: string;
  userId: string;
  timestamp: number;
  success?: boolean;
  status?: string;
  amount?: number;
}

export default function DashboardPage() {
  const { agents: contractAgents, loading: contractLoading } = useAgents();
  const { stats: platformStats, loading: statsLoading } = usePlatformStats();
  const { executions, loading: executionsLoading } = useExecutions(10);

  // Convert agent data to stats format
  const agentStats = useMemo<AgentStats[]>(() => {
    return contractAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      executions: Number(agent.totalExecutions),
      successfulExecutions: Number(agent.successfulExecutions),
      reputation: Number(agent.reputation),
      price: Number(agent.pricePerExecution) / 1_000_000,
    }));
  }, [contractAgents]);

  // Convert executions to activity format
  const recentActivity = useMemo<ActivityItem[]>(() => {
    return executions.map((exec) => {
      const agent = contractAgents.find((a) => a.id === exec.agentId);
      return {
        type: "execution" as const,
        id: exec.id,
        agentId: exec.agentId,
        agentName: agent?.name || `Agent ${exec.agentId}`,
        userId: exec.user,
        timestamp: Number(exec.timestamp) * 1000, // Convert to milliseconds
        success: exec.verified && exec.output !== "",
        status: exec.verified ? "verified" : "pending",
      };
    });
  }, [executions, contractAgents]);

  const loading = contractLoading || statsLoading || executionsLoading;

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  if (loading || contractLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <TetrisLoading size="md" speed="normal" loadingText="Loading dashboard..." />
      </div>
    );
  }

  const topAgents = agentStats
    .sort((a, b) => b.executions - a.executions)
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-black text-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-sm border-b border-neutral-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-neutral-50 to-neutral-400">
                Developer Dashboard
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Platform analytics and insights
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/agents/new"
                className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-green-500/20 flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Agent
              </Link>
              <Link
                href="/"
                className="text-sm text-neutral-400 hover:text-neutral-50 transition-colors"
              >
                Dashboard
              </Link>
              <WalletConnect />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Platform Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Total Agents</h3>
              <Bot className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-50">
              {platformStats?.totalAgents ?? 0}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Active agents</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Total Executions</h3>
              <Activity className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-50">
              {platformStats?.totalExecutions ?? 0}
            </div>
            <p className="text-xs text-neutral-500 mt-1">All time</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Total Revenue</h3>
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-green-500">
              ${platformStats?.totalRevenue ?? "0.00"}
            </div>
            <p className="text-xs text-neutral-500 mt-1">SOL earned</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Success Rate</h3>
              <TrendingUp className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-50">
              {platformStats?.successRate ?? "0"}%
            </div>
            <p className="text-xs text-neutral-500 mt-1">Platform average</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                href="/"
                className="flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-neutral-400 group-hover:text-neutral-50" />
                  <span>Browse Agents</span>
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-50" />
              </Link>
              <Link
                href="/dashboard/analytics"
                className="flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-neutral-400 group-hover:text-neutral-50" />
                  <span>View Analytics</span>
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-50" />
              </Link>
              <Link
                href="/dashboard/payments"
                className="flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-neutral-400 group-hover:text-neutral-50" />
                  <span>Payment History</span>
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-50" />
              </Link>
              <Link
                href="/dashboard/agents/new"
                className="flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Bot className="h-5 w-5 text-neutral-400 group-hover:text-neutral-50" />
                  <span>Register New Agent</span>
                </div>
                <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-50" />
              </Link>
            </div>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <h2 className="text-xl font-bold mb-4">Top Performing Agents</h2>
            {topAgents.length === 0 ? (
              <p className="text-neutral-500 text-sm">No agent data available</p>
            ) : (
              <div className="space-y-3">
                {topAgents.map((agent) => (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="flex items-center justify-between p-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors group"
                  >
                    <div>
                      <p className="font-medium text-sm">{agent.name}</p>
                      <p className="text-xs text-neutral-500">
                        {agent.executions} executions • {agent.reputation}/1000 rep
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-50" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Recent Activity</h2>
            <Link
              href="/dashboard/analytics"
              className="text-sm text-neutral-400 hover:text-neutral-50 transition-colors"
            >
              View All →
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-neutral-500 text-sm">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div
                  key={`${activity.type}-${activity.id}`}
                  className="flex items-center gap-4 p-3 bg-neutral-800 rounded-lg"
                >
                  {activity.type === "execution" ? (
                    <>
                      {activity.success ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {activity.agentName} executed
                        </p>
                        <p className="text-xs text-neutral-400">
                          {activity.success ? "Success" : "Failed"} • {formatTimeAgo(activity.timestamp)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          Payment {activity.status} for {activity.agentName}
                        </p>
                        <p className="text-xs text-neutral-400">
                          ${activity.amount?.toFixed(2)} • {formatTimeAgo(activity.timestamp)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All Agents List */}
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
          <h2 className="text-xl font-bold mb-4">All Agents</h2>
          {contractAgents.length === 0 ? (
            <p className="text-neutral-500">No agents available</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contractAgents.map((agent) => {
                const stats = agentStats.find((s) => s.id === agent.id);
                return (
                  <div
                    key={agent.id}
                    className="p-4 bg-neutral-800 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-bold text-neutral-50 group-hover:text-white">
                        {agent.name}
                      </h3>
                    </div>
                    <p className="text-xs text-neutral-400 mb-3 line-clamp-2">
                      {agent.description}
                    </p>
                    <div className="flex items-center justify-between text-sm mb-3">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-neutral-500">Executions:</span>
                          <span className="ml-1 font-medium">
                            {stats?.executions || Number(agent.totalExecutions)}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-500">Rep:</span>
                          <span className="ml-1 font-medium">
                            {Number(agent.reputation)}/1000
                          </span>
                        </div>
                      </div>
                      <div className="text-green-500 font-bold">
                        ${(Number(agent.pricePerExecution) / 1_000_000).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/agents/${agent.id}/analytics`}
                        className="flex-1 text-center px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-xs transition-colors"
                      >
                        Analytics
                      </Link>
                      <Link
                        href={`/agents/${agent.id}`}
                        className="flex-1 text-center px-3 py-2 bg-neutral-700 hover:bg-neutral-600 rounded text-xs transition-colors"
                      >
                        View
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
