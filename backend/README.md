# ElectroVault Backend

Node.js backend for ElectroVault. AI agent execution engine. Solana payment verification. REST API. Google Gemini AI. Crypto.com MCP Server integration.

## What This Backend Does

Receives agent execution requests. Verifies Solana transaction signatures on-chain. Executes AI agents using Google Gemini. Fetches real market and blockchain data. Returns results. Logs executions and payments.

## Prerequisites

- Node.js 18+
- Google Gemini API key
- Solana Devnet access

## Setup

```bash
cd backend
npm install
cp .env.example .env  # Add your API keys
npm run dev            # Runs on http://localhost:3001
```

## Environment Variables

```env
PORT=3001
GEMINI_API_KEY=your-gemini-api-key
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_REGISTRY_WALLET=4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9

# Optional
OPENAI_API_KEY=your-openai-key
CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY=your-key
```

**Required:** `GEMINI_API_KEY`, `SOLANA_REGISTRY_WALLET`

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Express server entry
│   ├── api/
│   │   ├── agents.ts         # Agent CRUD + execution
│   │   ├── chat.ts           # Unified chat endpoint
│   │   ├── analytics.ts      # Platform analytics
│   │   ├── executions.ts     # Execution history
│   │   ├── funding.ts        # Funding assistant
│   │   ├── logs.ts           # Execution/payment logs
│   │   └── vvs-swap.ts       # VVS Finance swap endpoints
│   ├── agent-engine/
│   │   ├── executor.ts       # Gemini AI execution engine
│   │   └── tools.ts          # Crypto.com SDK tools
│   ├── utils/
│   │   └── solana.ts         # Solana transaction verification
│   ├── mcp/                  # Crypto.com MCP Server client
│   ├── services/             # Service layer
│   ├── middleware/            # Rate limiting, validation
│   └── lib/
│       └── database.ts       # JSON file database
├── data/                     # Execution/payment logs (auto-created)
└── railway.json              # Railway deployment config
```

## API Endpoints

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Unified chat (requires `x-solana-signature` header) |

### Agents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| GET | `/api/agents/:id` | Get agent details |
| POST | `/api/agents/register` | Register new agent (requires Solana tx) |
| POST | `/api/agents/:id/execute` | Execute agent (requires Solana tx) |

### Analytics & Logs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/platform` | Platform-wide stats |
| GET | `/api/analytics/agents/:id` | Per-agent analytics |
| GET | `/api/executions` | Execution history |
| GET | `/api/logs/executions` | Filtered execution logs |
| GET | `/api/logs/payments` | Payment logs |

## Solana Payment Verification

Every request with a Solana signature is verified on-chain:

```typescript
// src/utils/solana.ts
const tx = await connection.getTransaction(signature);
const accountKeys = tx.transaction.message.getAccountKeys();
const registryIndex = accountKeys.staticAccountKeys.findIndex(
  key => key.equals(registryPubKey)
);
const actualLamports = meta.postBalances[registryIndex] - meta.preBalances[registryIndex];
// Verifies: tx exists, correct destination, sufficient amount
```

**Registry Wallet:** `4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9`

## Agent Execution Flow

1. Receive request with input + Solana signature
2. Verify Solana transaction on-chain (destination, amount)
3. Detect intent (market data, blockchain, contract analysis, content)
4. Fetch real data if needed (Crypto.com MCP Server, APIs)
5. Execute with Google Gemini AI
6. Log execution to database
7. Return result

## AI Engine

- **Model:** Google Gemini 2.5 Flash
- **Pre-configured agents:** Contract Auditor, Market Data, Content Generator
- **Auto-generated agents:** New agents get AI prompts from their description
- **Retry logic:** Automatic retry with exponential backoff (2s, 4s, 6s)

## Deployment

### Railway
```bash
# Already configured via railway.json
npm run build   # Compiles TypeScript
npm start       # Runs compiled JS
```

### Production Build
```bash
npm run build   # tsc → dist/
npm start       # node dist/index.js
```

## Testing

```bash
# Health check
curl http://localhost:3001/health

# List agents
curl http://localhost:3001/api/agents

# Chat (with Solana signature)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -H "x-solana-signature: YOUR_TX_SIGNATURE" \
  -d '{"input": "What is the price of Bitcoin?"}'
```
