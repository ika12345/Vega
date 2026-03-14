# Vega

First Web3-native AI agent marketplace on Solana. Unified chat assistant and AI agent marketplace with SOL micropayments. Ask anything in plain English, or browse and execute specialized AI agents. Every query is a real Solana transaction.

## What Makes Vega Unique

**1. AI Agent Marketplace with On-Chain Payments**
- Register AI agents with a real Solana transaction (0.01 SOL registration fee)
- Every agent execution requires a verified SOL micropayment
- Backend independently verifies each transaction signature on-chain
- Transparent, immutable payment records on Solana Devnet

**2. SOL Micropayments (Pay-Per-Use)**
- $0.10 per chat message, 0.01 SOL per agent execution
- No subscriptions, no monthly fees
- Every payment is a real Solana transfer verified on the ledger
- Developers earn 90% of execution payments

**3. Crypto.com Ecosystem Integration**
- Market Data MCP Server for real-time cryptocurrency prices
- AI-powered intent detection for market data, blockchain queries, swaps
- Google Gemini AI for agent execution

**4. Dual-Mode Architecture**
- **Unified Chat:** Ask anything in plain English — system auto-routes to right tools
- **Individual Agents Marketplace:** Browse specialized agents, execute directly
- Both modes require SOL micropayments

## How It Works

1. Connect your **Phantom wallet** (Solana Devnet)
2. Go to `/chat` and type a message (e.g., "What's the price of Bitcoin?")
3. Pay **0.01 SOL** via Phantom when prompted
4. Backend **verifies the Solana transaction** on-chain before executing
5. AI responds with real data
6. View the transaction on [Solana Explorer](https://explorer.solana.com/?cluster=devnet)

## Quick Start

### Prerequisites
- Node.js 18+
- Phantom wallet browser extension
- Solana Devnet SOL (get from [Solana Faucet](https://faucet.solana.com))

### Setup

```bash
# Clone the repo
git clone https://github.com/ika12345/Vega.git
cd Vega

# Backend
cd backend
npm install
cp .env.example .env  # Edit with your API keys
npm run dev            # Runs on http://localhost:3001

# Frontend (new terminal)
cd frontend
npm install
npm run dev            # Runs on http://localhost:3000
```

### Environment Variables

**Backend `.env`:**
```env
PORT=3001
GEMINI_API_KEY=your-gemini-api-key
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_REGISTRY_WALLET=4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9
```

**Frontend `.env.local`:**
```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_REGISTRY_WALLET=4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9
```

## Architecture

```
┌─────────────────┐     SOL Transfer      ┌──────────────────┐
│  Frontend        │ ──────────────────▶  │  Solana Devnet    │
│  (Next.js)       │                      │  (Real Ledger)    │
│  Phantom Wallet  │ ◀────────────────── │                    │
└────────┬─────────┘    Tx Confirmed      └──────────────────┘
         │                                         ▲
         │ API + Signature                         │
         ▼                                         │
┌─────────────────┐    Verify Signature    ────────┘
│  Backend         │
│  (Express.js)    │
│  Gemini AI       │
│  MCP Server      │
└─────────────────┘
```

**Payment Flow:**
1. User sends message → Frontend prompts Phantom for 0.01 SOL transfer to registry wallet
2. Phantom signs → SOL transfer confirmed on Solana Devnet
3. Frontend sends message + transaction signature to backend
4. Backend calls `connection.getTransaction(signature)` to verify on-chain
5. Backend validates destination address and amount
6. Only after verification → AI agent executes with Gemini

## Features

### Unified Chat (`/chat`)
- Ask anything in plain English
- Real-time market data via Crypto.com MCP Server
- Portfolio viewing, transaction history
- Voice input with multi-language support
- Rich markdown rendering
- $0.10 per message (0.01 SOL)

### AI Agent Marketplace (`/`)
- Browse specialized agents (Contract Auditor, Market Data, Content Generator)
- Execute agents with SOL micropayment
- Agent registration with on-chain transaction proof
- Real-time execution metrics and reputation

### Developer Dashboard (`/dashboard`)
- Create and register new agents (0.01 SOL registration fee)
- Track execution counts, revenue, success rates
- Payment history and analytics
- Per-agent analytics

## On-Chain Verification

Every payment is verified on the Solana ledger:

```typescript
// Backend verifies each transaction
const tx = await connection.getTransaction(signature);
const accountKeys = tx.transaction.message.getAccountKeys();
const registryIndex = accountKeys.staticAccountKeys.findIndex(
  key => key.equals(registryPubKey)
);
const actualLamports = meta.postBalances[registryIndex] - meta.preBalances[registryIndex];
```

**Registry Wallet:** [`4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9`](https://explorer.solana.com/address/4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9?cluster=devnet)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Wallet | Solana Wallet Adapter (Phantom) |
| Backend | Express.js, TypeScript |
| AI | Google Gemini 2.5 Flash |
| Blockchain | Solana Devnet |
| Market Data | Crypto.com MCP Server |
| Payments | Native SOL transfers (verified on-chain) |

## Project Structure

```
Vega/
├── frontend/          # Next.js frontend
│   ├── app/           # Pages (chat, agents, dashboard)
│   ├── components/    # SolanaPayment, WalletConnect, AIInput
│   └── hooks/         # useAgents, useExecutions, usePlatformStats
├── backend/           # Express.js backend
│   ├── src/api/       # REST endpoints (agents, chat, analytics)
│   ├── src/agent-engine/ # Gemini AI execution
│   ├── src/utils/     # Solana transaction verification
│   └── src/mcp/       # Crypto.com MCP Server client
└── contracts/         # (Legacy EVM contracts, not used)
```

## Demo for Judges

1. **Show the marketplace** → Homepage with registered agents
2. **Create an agent** → `/dashboard/agents/new` → pay 0.01 SOL → agent appears
3. **Use unified chat** → `/chat` → pay per message → get real AI responses
4. **Verify on Solana** → Open [Explorer](https://explorer.solana.com/address/4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9?cluster=devnet) → show real transactions
5. **Every interaction is a real on-chain micropayment** → Show tx details (sender, receiver, amount, block)

## Documentation

- [Backend README](backend/README.md) — API endpoints, Solana verification, AI engine
- [Frontend README](frontend/README.md) — Pages, components, wallet integration
