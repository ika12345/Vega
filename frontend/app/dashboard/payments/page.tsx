"use client";

import { useState, useEffect } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import TetrisLoading from "@/components/ui/tetris-loader";
import Link from "next/link";
import { ArrowLeft, CreditCard, DollarSign, CheckCircle2, XCircle, Clock, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";
import { useAccount } from "wagmi";
import { getContractAddresses } from "@/lib/contracts";
import { useReadContract } from "wagmi";
import { AGENT_REGISTRY_ABI } from "@/lib/contracts";

interface PaymentData {
  agentId: number;
  agentName: string;
  executions: number;
  successfulExecutions: number;
  revenue: number;
  price: number;
}

interface PaymentLog {
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

export default function PaymentsPage() {
  const { address, isConnected } = useAccount();
  const { agentRegistry } = getContractAddresses();
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);

  // Get all agents to calculate payments
  const { data: nextAgentId } = useReadContract({
    address: agentRegistry,
    abi: AGENT_REGISTRY_ABI,
    functionName: "nextAgentId",
    query: { enabled: isConnected && !!agentRegistry },
  });

  useEffect(() => {
    if (nextAgentId && isConnected) {
      fetchPaymentData();
      fetchPaymentLogs();
    } else {
      setLoading(false);
    }
  }, [nextAgentId, isConnected]);

  const fetchPaymentData = async () => {
    try {
      if (!nextAgentId) return;

      const agentCount = Number(nextAgentId);
      const paymentPromises: Promise<PaymentData | null>[] = [];

      for (let i = 1; i < agentCount; i++) {
        paymentPromises.push(
          fetchAgentPaymentData(i).catch(() => null)
        );
      }

      const results = await Promise.all(paymentPromises);
      const validPayments = results.filter((p): p is PaymentData => p !== null);
      
      setPayments(validPayments);
      setTotalRevenue(validPayments.reduce((sum, p) => sum + p.revenue, 0));
    } catch (error) {
      console.error("Error fetching payment data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentPaymentData = async (agentId: number): Promise<PaymentData | null> => {
    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const [agentResponse, analyticsResponse] = await Promise.all([
        fetch(`${apiUrl}/api/agents/${agentId}`),
        fetch(`${apiUrl}/api/analytics/agents/${agentId}`),
      ]);

      if (!agentResponse.ok || !analyticsResponse.ok) {
        return null;
      }

      const agentData = await agentResponse.json();
      const analyticsData = await analyticsResponse.json();

      return {
        agentId,
        agentName: agentData.agent?.name || `Agent ${agentId}`,
        executions: analyticsData.stats?.totalExecutions || 0,
        successfulExecutions: analyticsData.stats?.successfulExecutions || 0,
        revenue: parseFloat(analyticsData.stats?.revenue || "0"),
        price: analyticsData.stats?.price || 0,
      };
    } catch (error) {
      console.error(`Error fetching payment data for agent ${agentId}:`, error);
      return null;
    }
  };

  const fetchPaymentLogs = async () => {
    try {
      let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      if (typeof window !== "undefined" && apiUrl.includes("localhost") && window.location.hostname !== "localhost") {
        apiUrl = apiUrl.replace("localhost", window.location.hostname);
      }
      const response = await fetch(`${apiUrl}/api/logs/payments?limit=100`);
      if (response.ok) {
        const data = await response.json();
        setPaymentLogs(data.payments || []);
        
        // Calculate status breakdown
        const breakdown: Record<string, number> = {};
        data.payments.forEach((p: PaymentLog) => {
          breakdown[p.status] = (breakdown[p.status] || 0) + 1;
        });
        setStatusBreakdown(breakdown);
      }
    } catch (error) {
      console.error("Error fetching payment logs:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "settled":
      case "verified":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "refunded":
        return <RefreshCw className="h-4 w-4 text-blue-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-neutral-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "settled":
      case "verified":
        return "text-green-500";
      case "pending":
        return "text-yellow-500";
      case "failed":
        return "text-red-500";
      case "refunded":
        return "text-blue-500";
      default:
        return "text-neutral-500";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <TetrisLoading size="md" speed="normal" loadingText="Loading payments..." />
      </div>
    );
  }

  const totalPayments = payments.reduce((sum, p) => sum + p.successfulExecutions, 0);

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
                  Payment History
                </h1>
                <p className="text-sm text-neutral-400 mt-1">
                  Track all agent execution payments
                </p>
              </div>
            </div>
            <WalletConnect />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Total Revenue</h3>
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-3xl font-bold text-green-500">
              ${totalRevenue.toFixed(2)}
            </div>
            <p className="text-xs text-neutral-500 mt-1">USDC earned</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Total Payments</h3>
              <CreditCard className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-50">
              {totalPayments}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Successful executions</p>
          </div>

          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-neutral-400">Agents with Payments</h3>
              <CheckCircle2 className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="text-3xl font-bold text-neutral-50">
              {payments.filter((p) => p.successfulExecutions > 0).length}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Active agents</p>
          </div>
        </div>

        {/* Payment Status Breakdown */}
        {Object.keys(statusBreakdown).length > 0 && (
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Payment Status Breakdown</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {["settled", "verified", "pending", "failed", "refunded"].map((status) => {
                const count = statusBreakdown[status] || 0;
                return (
                  <div key={status} className="bg-neutral-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(status)}
                      <span className="text-xs text-neutral-400 capitalize">{status}</span>
                    </div>
                    <div className={`text-2xl font-bold ${getStatusColor(status)}`}>
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Payment Logs */}
        {paymentLogs.length > 0 && (
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Recent Payment Transactions</h2>
            <div className="space-y-3">
              {paymentLogs.slice(0, 20).map((payment) => (
                <div
                  key={payment.paymentHash}
                  className="flex items-center justify-between p-4 bg-neutral-800 rounded-lg border border-neutral-700"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {getStatusIcon(payment.status)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{payment.agentName}</p>
                      <p className="text-xs text-neutral-400 mt-1">
                        {new Date(payment.timestamp).toLocaleString()} • {payment.status}
                      </p>
                      {payment.transactionHash && (
                        <a
                          href={`https://explorer.cronos.org/testnet/tx/${payment.transactionHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-flex items-center gap-1"
                        >
                          View on Cronos Explorer <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${getStatusColor(payment.status)}`}>
                      ${payment.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments List */}
        <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
          <h2 className="text-xl font-bold mb-4">Payment Breakdown by Agent</h2>
          {payments.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 mx-auto mb-4 text-neutral-500 opacity-50" />
              <p className="text-neutral-500">No payment data available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {payments
                .sort((a, b) => b.revenue - a.revenue)
                .map((payment) => (
                  <div
                    key={payment.agentId}
                    className="flex items-center justify-between p-4 bg-neutral-800 rounded-lg border border-neutral-700 hover:border-neutral-600 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-shrink-0">
                        {payment.successfulExecutions > 0 ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <Clock className="h-5 w-5 text-neutral-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/agents/${payment.agentId}`}
                          className="font-medium text-neutral-50 hover:text-white transition-colors"
                        >
                          {payment.agentName}
                        </Link>
                        <div className="flex items-center gap-4 mt-1 text-sm text-neutral-400">
                          <span>{payment.successfulExecutions} successful</span>
                          <span>•</span>
                          <span>{payment.executions - payment.successfulExecutions} failed</span>
                          <span>•</span>
                          <span>${payment.price.toFixed(2)} per execution</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-500">
                        ${payment.revenue.toFixed(2)}
                      </div>
                      <div className="text-xs text-neutral-500">Revenue</div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Note */}
        <div className="mt-6 p-4 bg-neutral-900 rounded-lg border border-neutral-800">
          <p className="text-sm text-neutral-400">
            💡 <strong>Note:</strong> Payment data is calculated from on-chain agent execution records. 
            All payments are settled via x402 protocol on Cronos testnet.
          </p>
        </div>
      </div>
    </div>
  );
}
