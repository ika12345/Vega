# Vega Frontend

Next.js frontend for Vega. Connect Phantom wallet. Browse AI agents. Chat with AI. Pay via SOL micropayments. Real-time updates.

## Prerequisites

- Node.js 18+
- Phantom wallet browser extension
- Solana Devnet SOL ([Get from faucet](https://faucet.solana.com))

## Setup

```bash
cd frontend
npm install
npm run dev    # Runs on http://localhost:3000
```

## Environment Variables

Create `.env.local`:
```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOLANA_REGISTRY_WALLET=4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9
```

## Project Structure

```
frontend/
├── app/
│   ├── page.tsx                    # Homepage (marketplace)
│   ├── chat/page.tsx               # Unified chat interface
│   ├── agents/[id]/page.tsx        # Agent detail & execution
│   ├── dashboard/
│   │   ├── page.tsx                # Dashboard overview
│   │   ├── agents/new/page.tsx     # Register new agent
│   │   ├── analytics/page.tsx      # Platform analytics
│   │   └── payments/page.tsx       # Payment history
│   ├── providers.tsx               # Solana wallet providers
│   └── layout.tsx                  # Root layout
├── components/
│   ├── SolanaPayment.tsx           # SOL payment component
│   ├── WalletConnect.tsx           # Phantom wallet button
│   ├── FundingAssistant.tsx        # Devnet funding helper
│   └── ui/
│       ├── ai-input.tsx            # Chat input with voice
│       ├── chat-bubble.tsx         # Message bubbles
│       └── tetris-loader.tsx       # Loading animation
├── hooks/
│   ├── useAgents.ts                # Agent data (from API)
│   ├── useExecutions.ts            # Execution history (from API)
│   ├── usePlatformStats.ts         # Platform statistics
│   └── useFundingStatus.ts         # Wallet funding check
└── lib/
    └── utils.ts                    # Utility functions
```

## Pages

### Home (`/`)
- Browse all registered AI agents
- Search and filter by category
- Agent cards with pricing, reputation, execution counts
- CTA for unified chat and agent marketplace

### Unified Chat (`/chat`)
- ChatGPT-style interface
- Ask anything in plain English
- Pays 0.01 SOL per message via Phantom
- Voice input with multi-language support (EN, FR, SW, AR, ES, PT)
- Rich markdown rendering with code blocks
- Quick action buttons (Portfolio, Transactions, Swap, Transfer, Balance)

### Agent Execution (`/agents/[id]`)
- View agent details, reputation, metrics
- Execute agent with custom input
- Pay 0.01 SOL via Phantom
- View AI-generated results

### Developer Dashboard (`/dashboard`)
- Platform stats: total agents, executions, revenue, success rate
- Top performing agents
- Recent activity feed
- Quick actions navigation

### Register Agent (`/dashboard/agents/new`)
- Form: name, description, price
- Pay 0.01 SOL registration fee via Phantom
- Transaction signature stored as on-chain proof
- Agent appears on marketplace immediately

## Wallet Integration

- **Solana Wallet Adapter** with Phantom support
- Auto-detects Solana Devnet
- Balance display in SOL
- All transactions signed via Phantom popup

## Payment Flow

1. User types message or executes agent
2. `SolanaPayment` component creates `SystemProgram.transfer` (0.01 SOL → registry wallet)
3. Phantom prompts user to sign
4. Transaction confirmed on Solana Devnet
5. Signature sent to backend for verification
6. Backend verifies on-chain before executing AI

## Build & Deploy

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Deploy to Vercel
vercel --prod
```

## Tech Stack

- Next.js 16 with App Router
- React 19
- Tailwind CSS 4
- Solana Wallet Adapter
- @solana/web3.js
- Framer Motion (animations)
- Spline (3D hero section)
- Lucide React (icons)
- React Markdown + remark-gfm
