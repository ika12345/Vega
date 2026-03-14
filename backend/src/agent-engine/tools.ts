/**
 * Agent Tools - Crypto.com API Integration
 * Provides real blockchain and market data capabilities to agents
 */

import { ethers } from "ethers";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

// Solana RPC URL
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

// Crypto.com Market Data MCP Server URL
const MCP_MARKET_DATA_URL = "https://mcp.crypto.com/market-data/mcp";

// MCP Client instance (lazy initialized)
let mcpClient: any = null;
let mcpClientInitialized = false;

export interface AgentTools {
  hasBlockchainAccess: boolean;
  hasMarketDataAccess: boolean;
  hasSwapAccess: boolean;
  hasSolanaAccess: boolean;
  tools: string[];
}

/**
 * Determine which tools an agent should have based on its description
 */
export function determineAgentTools(description: string): AgentTools {
  const descLower = description.toLowerCase();
  
  const tools: string[] = [];
  let hasBlockchainAccess = false;
  let hasMarketDataAccess = false;
  let hasSwapAccess = false;
  let hasSolanaAccess = false;

  // Check for blockchain-related keywords
  const blockchainKeywords = [
    "blockchain", "contract", "transaction", "balance", "wallet", 
    "token", "nft", "defi", "cronos", "ethereum", "address", 
    "block", "explorer", "on-chain"
  ];

  // Solana keywords
  const solanaKeywords = ["solana", "sol", "spl", "phantom", "metaplex", "anchor"];
  
  // Check for market data keywords
  const marketDataKeywords = [
    "market", "price", "trading", "volume", "crypto", "bitcoin", 
    "ethereum", "cryptocurrency", "exchange", "ticker", "quote"
  ];

  // Check for swap/DEX keywords
  const swapKeywords = [
    "swap", "exchange", "trade", "dex", "vvs", "finance", "liquidity",
    "token swap", "convert", "exchange token", "swap token"
  ];

  // Determine tools based on description
  if (blockchainKeywords.some(keyword => descLower.includes(keyword)) || solanaKeywords.some(keyword => descLower.includes(keyword))) {
    hasBlockchainAccess = true;
    tools.push("blockchain_query");
    tools.push("balance_check");
    tools.push("transaction_lookup");
    
    if (solanaKeywords.some(k => descLower.includes(k))) {
      hasSolanaAccess = true;
      tools.push("solana_balance");
    }
  }

  if (marketDataKeywords.some(keyword => descLower.includes(keyword))) {
    hasMarketDataAccess = true;
    tools.push("market_data");
    tools.push("price_lookup");
    tools.push("volume_analysis");
  }

  if (swapKeywords.some(keyword => descLower.includes(keyword))) {
    hasSwapAccess = true;
    tools.push("vvs_swap");
    tools.push("token_swap");
    tools.push("get_swap_quote");
  }

  return {
    hasBlockchainAccess,
    hasMarketDataAccess,
    hasSwapAccess,
    hasSolanaAccess,
    tools,
  };
}

/**
 * Create Crypto.com AI Agent SDK client
 * Requires: @crypto.com/ai-agent-client package and API keys
 * Supports both OpenAI and Gemini (GoogleGenAI) providers
 * 
 * IMPORTANT: The AI Agent SDK requires the Developer Platform API key for authentication.
 * We initialize the Developer Platform Client SDK first, then create the AI Agent client.
 */
export function createCryptoComClient(): any {
  try {
    // First, initialize the Developer Platform Client SDK (required for authentication)
    const { Client } = require("@crypto.com/developer-platform-client");
    const { createClient, QueryOptions } = require("@crypto.com/ai-agent-client");
    
    // Check for Gemini API key first (preferred, since we're using Gemini for agents)
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const googleProjectId = process.env.GOOGLE_PROJECT_ID;
    const openAIApiKey = process.env.OPENAI_API_KEY;
    const cronosTestnetExplorerKey = process.env.CRONOS_TESTNET_EXPLORER_KEY;
    // Developer Platform API key (from https://developer.crypto.com) - required for authentication
    const developerPlatformApiKey = process.env.CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY;
    
    // Both keys are important but serve different purposes:
    // - Developer Platform API key: Required for endpoint authentication
    // - Explorer API key: Used for blockchain explorer queries (optional but recommended)
    
    if (!developerPlatformApiKey) {
      console.warn("⚠️ Crypto.com AI Agent SDK not fully configured. Blockchain queries will not work.");
      console.warn("   Set CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY in .env to enable");
      console.warn("   Get it from: https://developer.crypto.com (create a project)");
      return null;
    }
    
    if (!cronosTestnetExplorerKey) {
      console.warn("⚠️ CRONOS_TESTNET_EXPLORER_KEY not set - some blockchain queries may be limited");
      console.warn("   Get it from: https://explorer-api-doc.cronos.org");
    }
    
    // Initialize Developer Platform Client SDK first (required for authentication)
    try {
      Client.init({
        apiKey: developerPlatformApiKey,
        // provider is optional, SDK will use default
      });
      console.log("✅ Developer Platform Client SDK initialized with API key");
    } catch (initError) {
      console.warn("⚠️ Failed to initialize Developer Platform Client SDK:", initError);
      // Continue anyway - might still work
    }
    
    // IMPORTANT: The Node.js SDK (@crypto.com/ai-agent-client) only supports OpenAI
    // The TypeScript interfaces show only `openAI` field, no `gemini` support
    // Gemini support is available via REST API, but not through this SDK
    // Documentation showing Gemini is for Python SDK or REST API, not Node.js SDK
    let queryOptions: any; // Use 'any' to allow adding Developer Platform API key
    
    if (openAIApiKey) {
      console.log("✅ Using OpenAI for Crypto.com AI Agent SDK");
      console.log("   Model: gpt-4o-mini (cheapest model - $0.075/$0.30 per 1M tokens)");
      queryOptions = {
        openAI: {
          apiKey: openAIApiKey,
          model: "gpt-4o-mini", // Cheapest OpenAI model: $0.075 input / $0.30 output per 1M tokens
        },
        chainId: 338, // Cronos Testnet
        explorerKeys: {
          cronosTestnetKey: cronosTestnetExplorerKey || undefined,
        },
      };
    } else if (geminiApiKey) {
      // Gemini is available but Node.js SDK doesn't support it
      // The SDK TypeScript interface only defines `openAI`, not `gemini`
      // Gemini support exists in REST API/Python SDK, but not Node.js SDK
      console.warn("⚠️ Node.js AI Agent SDK only supports OpenAI, not Gemini");
      console.warn("   Set OPENAI_API_KEY in .env to use AI Agent SDK");
      console.warn("   Falling back to Developer Platform SDK for all queries");
      console.warn("   (This is fine - Developer Platform SDK works perfectly)");
      // Return null so we skip AI Agent SDK and use fallbacks
      return null;
    } else {
      console.warn("⚠️ Crypto.com AI Agent SDK not fully configured. Blockchain queries will not work.");
      console.warn("   Set OPENAI_API_KEY in .env to enable AI Agent SDK");
      console.warn("   Also set CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY");
      console.warn("   (Note: GEMINI_API_KEY is used for agent responses, not AI Agent SDK)");
      return null;
    }
    
    // Add Developer Platform API key to query options
    // According to documentation, the SDK expects blockchain_config.api_key
    console.log("✅ Adding Developer Platform API key to AI Agent SDK options");
    // The correct format according to Crypto.com documentation
    queryOptions.blockchain_config = {
      api_key: developerPlatformApiKey, // Use api_key (snake_case), not 'api-key'
    };
    
    // Also try alternative formats as fallback (in case SDK version differs)
    queryOptions.blockchainConfig = {
      api_key: developerPlatformApiKey,
    };
    queryOptions.developerPlatformApiKey = developerPlatformApiKey;

    const client = createClient(queryOptions);
    console.log(`[SDK] ✅ Client created successfully`);
    console.log(`[SDK] Client structure:`, {
      hasAgent: !!client?.agent,
      hasGenerateQuery: !!(client?.agent?.generateQuery),
      clientKeys: client ? Object.keys(client) : [],
    });
    return client;
  } catch (error) {
    console.warn("⚠️ Crypto.com AI Agent SDK not available:", error instanceof Error ? error.message : String(error));
    console.warn("   Install with: npm install @crypto.com/ai-agent-client");
    return null;
  }
}

/**
 * Initialize MCP Client for Crypto.com Market Data
 * Uses @modelcontextprotocol/sdk to connect to MCP Server
 * Track 2 Requirement: Market Data MCP Server Integration
 */
async function initMCPClient(): Promise<any> {
  if (mcpClientInitialized && mcpClient) {
    return mcpClient;
  }

  if (mcpClientInitialized && !mcpClient) {
    return null; // Already attempted and failed
  }

  try {
    const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
    
    console.log(`[MCP] Connecting to Crypto.com Market Data MCP Server: ${MCP_MARKET_DATA_URL}`);
    
    const transport = new StreamableHTTPClientTransport(new URL(MCP_MARKET_DATA_URL));
    const client = new Client({ 
      name: "onechat-backend", 
      version: "1.0.0" 
    });

    await client.connect(transport);
    console.log("[MCP] ✅ Connected to Crypto.com Market Data MCP Server");
    
    mcpClient = client;
    mcpClientInitialized = true;
    return client;
  } catch (error) {
    console.error("[MCP] ❌ Failed to initialize MCP client:", error);
    console.log("[MCP] ⚠️ MCP Server unavailable, will use REST API fallback");
    mcpClientInitialized = true; // Mark as attempted to avoid retry loops
    mcpClient = null;
    return null;
  }
}

/**
 * Fetch market data using Crypto.com Market Data MCP Server
 * Priority: MCP Server → REST API fallback
 */
async function fetchMarketDataViaMCP(symbol: string): Promise<any> {
  try {
    const client = await initMCPClient();
    if (!client) {
      return null; // Will fallback to REST API
    }

    // Normalize symbol
    const symbolMap: Record<string, string> = {
      "BITCOIN": "BTC",
      "ETHEREUM": "ETH",
      "SOLANA": "SOL",
      "CARDANO": "ADA",
      "POLKADOT": "DOT",
    };
    
    const normalizedSymbol = symbolMap[symbol.toUpperCase()] || symbol.toUpperCase();
    
    console.log(`[MCP] Fetching market data for ${normalizedSymbol} via MCP Server...`);

    // List available tools first
    let tools;
    try {
      tools = await client.listTools();
      console.log(`[MCP] Available tools: ${tools.tools?.map((t: any) => t.name).join(", ") || "none"}`);
    } catch (toolError) {
      console.error("[MCP] Failed to list tools:", toolError);
      return null;
    }

    // Try to find the best tool for price queries
    // Prefer get_ticker (most common), then get_mark_price, then get_index_price
    let priceTool = tools.tools?.find((t: any) => t.name === "get_ticker");
    if (!priceTool) {
      priceTool = tools.tools?.find((t: any) => t.name === "get_mark_price");
    }
    if (!priceTool) {
      priceTool = tools.tools?.find((t: any) => 
        t.name.toLowerCase().includes("ticker") ||
        t.name.toLowerCase().includes("price")
      );
    }

    if (priceTool) {
      console.log(`[MCP] Using tool: ${priceTool.name}`);
      try {
        // Format instrument name (e.g., "BTC_USD" for Crypto.com Exchange format)
        const instrumentName = `${normalizedSymbol}_USD`;
        
        // Call the tool with correct parameter name
        const result = await client.callTool({
          name: priceTool.name,
          arguments: { 
            instrument_name: instrumentName, // MCP tools use instrument_name
          },
        });

        if (result && result.content && result.content.length > 0) {
          const content = result.content[0];
          let data;
          
          if (typeof content === 'string') {
            try {
              data = JSON.parse(content);
            } catch {
              // If not JSON, try to extract data from text
              data = { text: content };
            }
          } else {
            data = content;
          }
          
          console.log(`[MCP] ✅ Market data fetched via MCP Server`);
          
          // Extract price data from various possible formats
          const price = data.price || data.last_price || data.current_price || 
                       data.text?.match(/\$?([\d,]+\.?\d*)/)?.[1]?.replace(/,/g, '');
          
          return {
            symbol: normalizedSymbol,
            price: price || "N/A",
            price24hAgo: data.price_24h_ago || data.prev_price_24h || "N/A",
            change24h: data.change_24h || data.price_change_percent_24h || "N/A",
            volume24h: data.volume_24h || data.base_volume_24h || "N/A",
            high24h: data.high_24h || data.high_price_24h || "N/A",
            low24h: data.low_24h || data.low_price_24h || "N/A",
            timestamp: Date.now(),
            source: "Crypto.com Market Data MCP Server",
            rawData: data, // Include raw data for debugging
          };
        }
      } catch (toolCallError) {
        console.error(`[MCP] Error calling tool ${priceTool.name}:`, toolCallError);
        return null;
      }
    } else {
      console.log("[MCP] No price tool found, trying resources...");
    }

    // If no specific tool, try reading as resource
    try {
      const resources = await client.listResources();
      const priceResource = resources.resources?.find((r: any) => 
        r.uri?.includes(normalizedSymbol.toLowerCase())
      );

      if (priceResource) {
        const resource = await client.readResource({ uri: priceResource.uri });
        if (resource && resource.contents && resource.contents.length > 0) {
          const content = resource.contents[0];
          const data = typeof content === 'string' ? JSON.parse(content) : content;
          
          return {
            symbol: normalizedSymbol,
            price: data.price || data.last_price,
            timestamp: Date.now(),
            source: "Crypto.com Market Data MCP Server",
          };
        }
      }
    } catch (resourceError) {
      // Resource read failed, continue to fallback
      console.log("[MCP] Resource read failed, using fallback");
    }

    return null; // Will fallback to REST API
  } catch (error) {
    console.error(`[MCP] Error fetching market data via MCP:`, error);
    return null; // Will fallback to REST API
  }
}

/**
 * Fetch market data from Crypto.com
 * Priority: MCP Server → REST API fallback
 * Uses Crypto.com Market Data MCP Server (Track 2 requirement)
 */
export async function fetchMarketData(symbol: string): Promise<any> {
  try {
    // Normalize symbol (BTC -> BTC, bitcoin -> BTC, etc.)
    const symbolMap: Record<string, string> = {
      "BITCOIN": "BTC",
      "ETHEREUM": "ETH",
      "SOLANA": "SOL",
      "CARDANO": "ADA",
      "POLKADOT": "DOT",
    };
    
    const normalizedSymbol = symbolMap[symbol.toUpperCase()] || symbol.toUpperCase();
    
    // Priority 1: Try MCP Server first (Track 2 requirement)
    console.log(`[Market Data] Attempting to fetch ${normalizedSymbol} via MCP Server...`);
    const mcpData = await fetchMarketDataViaMCP(normalizedSymbol);
    
    if (mcpData && !mcpData.error) {
      console.log(`[Market Data] ✅ Successfully fetched via MCP Server`);
      return mcpData;
    }

    // Priority 2: Fallback to REST API
    console.log(`[Market Data] MCP Server unavailable, using REST API fallback...`);
    const response = await fetch(`https://api.crypto.com/v2/public/get-ticker?instrument_name=${normalizedSymbol}_USD`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json() as any;
      const ticker = data.result?.data?.[0];
      
      if (ticker) {
        return {
          symbol: normalizedSymbol,
          price: ticker.last_price,
          price24hAgo: ticker.prev_price_24h,
          change24h: ticker.price_change_percent_24h,
          volume24h: ticker.base_volume_24h,
          high24h: ticker.high_price_24h,
          low24h: ticker.low_price_24h,
          timestamp: Date.now(),
          source: "Crypto.com Exchange API (REST fallback)",
        };
      }
    }

    // Error case
    return {
      symbol: normalizedSymbol,
      error: "Market data not available",
      note: "Please check the symbol and try again",
      source: "Crypto.com Market Data",
    };
  } catch (error) {
    console.error(`Error fetching market data for ${symbol}:`, error);
    return {
      symbol: symbol.toUpperCase(),
      error: "Failed to fetch market data",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Query block information using RPC
 * Handles latest block, block by number queries
 */
async function queryBlockInfoViaRPC(query: string): Promise<string> {
  try {
    const { ethers } = require("ethers");
    const cronosRpcUrl = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";
    const queryLower = query.toLowerCase();
    
    console.log(`[SDK] Using RPC call to ${cronosRpcUrl} for block query`);
    
    // Create provider
    const provider = new ethers.JsonRpcProvider(cronosRpcUrl);
    
    // Check if query is for latest block
    if (queryLower.includes('latest') || queryLower.includes('current') || queryLower.includes('most recent')) {
      try {
        const blockNumber = await provider.getBlockNumber();
        const block = await provider.getBlock(blockNumber);
        
        console.log(`[SDK] ✅ Latest block fetched via RPC: ${blockNumber}`);
        
        const timestamp = block?.timestamp ? new Date(Number(block.timestamp) * 1000).toISOString() : 'unknown';
        const transactionCount = block?.transactions?.length || 0;
        const gasUsed = block?.gasUsed?.toString() || 'N/A';
        const gasLimit = block?.gasLimit?.toString() || 'N/A';
        
        return `Latest Block Information:\n` +
               `- Block Number: ${blockNumber}\n` +
               `- Timestamp: ${timestamp}\n` +
               `- Transaction Count: ${transactionCount}\n` +
               `- Gas Used: ${gasUsed}\n` +
               `- Gas Limit: ${gasLimit}\n` +
               `- Hash: ${block?.hash || 'N/A'}\n` +
               `\nView on Cronos Explorer: https://explorer.cronos.org/testnet/block/${blockNumber}`;
      } catch (error: any) {
        console.error("[SDK] ❌ Error fetching latest block via RPC:", error);
        return `Error fetching latest block: ${error?.message || String(error)}`;
      }
    }
    
    // Check if query is for specific block number
    const blockNumberMatch = query.match(/\b(\d+)\b/);
    if (blockNumberMatch) {
      try {
        const blockNumber = parseInt(blockNumberMatch[1], 10);
        const block = await provider.getBlock(blockNumber);
        
        if (!block) {
          return `Block ${blockNumber} not found. It may not exist yet or the number is invalid.`;
        }
        
        console.log(`[SDK] ✅ Block ${blockNumber} fetched via RPC`);
        
        const timestamp = block?.timestamp ? new Date(Number(block.timestamp) * 1000).toISOString() : 'unknown';
        const transactionCount = block?.transactions?.length || 0;
        const gasUsed = block?.gasUsed?.toString() || 'N/A';
        const gasLimit = block?.gasLimit?.toString() || 'N/A';
        
        return `Block ${blockNumber} Information:\n` +
               `- Block Number: ${blockNumber}\n` +
               `- Timestamp: ${timestamp}\n` +
               `- Transaction Count: ${transactionCount}\n` +
               `- Gas Used: ${gasUsed}\n` +
               `- Gas Limit: ${gasLimit}\n` +
               `- Hash: ${block?.hash || 'N/A'}\n` +
               `- Parent Hash: ${block?.parentHash || 'N/A'}\n` +
               `\nView on Cronos Explorer: https://explorer.cronos.org/testnet/block/${blockNumber}`;
      } catch (error: any) {
        console.error("[SDK] ❌ Error fetching block via RPC:", error);
        return `Error fetching block: ${error?.message || String(error)}`;
      }
    }
    
    // Default: get latest block
    try {
      const blockNumber = await provider.getBlockNumber();
      return `Latest block number on Cronos: ${blockNumber}\n` +
             `View on Cronos Explorer: https://explorer.cronos.org/testnet/block/${blockNumber}`;
    } catch (error: any) {
      return `Error fetching block information: ${error?.message || String(error)}`;
    }
  } catch (error: any) {
    console.error("[SDK] ❌ Error in RPC block query:", error);
    return `Error: ${error?.message || String(error)}`;
  }
}

/**
 * Query blockchain using direct RPC calls (final fallback)
 * Uses ethers.js to query Cronos RPC directly
 */
async function queryBlockchainViaRPC(query: string): Promise<string> {
  try {
    const { ethers } = require("ethers");
    const cronosRpcUrl = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";
    
    // Extract address from query (look for 0x... pattern)
    const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
    if (!addressMatch) {
      return "Could not find a valid Ethereum address in the query. Please provide an address starting with 0x.";
    }
    
    const address = addressMatch[0];
    console.log(`[SDK] Using direct RPC call to ${cronosRpcUrl} for address: ${address}`);
    
    // Create provider
    const provider = new ethers.JsonRpcProvider(cronosRpcUrl);
    
    // Check if query is about balance
    if (query.toLowerCase().includes('balance')) {
      try {
        const balanceWei = await provider.getBalance(address);
        const balanceCro = ethers.formatEther(balanceWei);
        console.log(`[SDK] ✅ Balance fetched via RPC: ${balanceCro} CRO`);
        
        return `Balance for address ${address}: ${balanceCro} CRO (${balanceWei.toString()} wei)`;
      } catch (balanceError: any) {
        console.error("[SDK] ❌ Error fetching balance via RPC:", balanceError);
        return `Error fetching balance via RPC: ${balanceError?.message || String(balanceError)}`;
      }
    }
    
    // Check if query is about transactions
    if (query.toLowerCase().includes('transaction') || query.toLowerCase().includes('tx')) {
      try {
        // Get transaction count (nonce)
        const txCount = await provider.getTransactionCount(address);
        const blockNumber = await provider.getBlockNumber();
        
        console.log(`[SDK] ✅ Transaction count fetched via RPC: ${txCount} transactions`);
        
        // Try to get recent block to show some context
        let recentBlockInfo = "";
        try {
          const recentBlock = await provider.getBlock(blockNumber);
          recentBlockInfo = `Latest block: ${blockNumber} (${recentBlock?.timestamp ? new Date(recentBlock.timestamp * 1000).toISOString() : 'unknown'})`;
        } catch (e) {
          // Ignore block fetch errors
        }
        
        return `Transaction information for address ${address}:\n` +
               `- Total transaction count: ${txCount}\n` +
               `${recentBlockInfo ? `- ${recentBlockInfo}\n` : ''}` +
               `\nNote: For detailed transaction history, please visit https://explorer.cronos.org/testnet/address/${address}`;
      } catch (txError: any) {
        console.error("[SDK] ❌ Error fetching transaction info via RPC:", txError);
        return `Error fetching transaction info via RPC: ${txError?.message || String(txError)}. ` +
               `You can check transactions at https://explorer.cronos.org/testnet/address/${address}`;
      }
    }
    
    // Default: return address info with helpful links
    return `Address ${address} found in query. Query completed via direct RPC.\n` +
           `You can view this address on Cronos Explorer: https://explorer.cronos.org/testnet/address/${address}`;
  } catch (error: any) {
    console.error("[SDK] ❌ Error in RPC blockchain query:", error);
    return `Error: ${error?.message || String(error)}`;
  }
}

/**
 * Query blockchain using Developer Platform API endpoint directly
 * Uses the REST API endpoint: https://developer-platform-api.crypto.com/api/v1/cdc-developer-platform/token/native-token-balance
 */
async function queryBlockchainViaAPI(query: string): Promise<string> {
  try {
    const developerPlatformApiKey = process.env.CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY || process.env.CRONOS_TESTNET_EXPLORER_KEY;
    
    if (!developerPlatformApiKey) {
      console.log("[SDK] No Developer Platform API key, falling back to RPC...");
      return await queryBlockchainViaRPC(query);
    }
    
    // Extract address from query (look for 0x... pattern)
    const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
    if (!addressMatch) {
      return "Could not find a valid Ethereum address in the query. Please provide an address starting with 0x.";
    }
    
    const address = addressMatch[0];
    console.log(`[SDK] Using Developer Platform API endpoint directly for address: ${address}`);
    
    // Check if query is about balance
    if (query.toLowerCase().includes('balance')) {
      try {
        const apiUrl = `https://developer-platform-api.crypto.com/api/v1/cdc-developer-platform/token/native-token-balance?walletAddress=${address}`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${developerPlatformApiKey}`,
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json() as any;
        console.log(`[SDK] ✅ Balance fetched via Developer Platform API:`, data);
        
        if (data && data.status === 'Success' && data.data && data.data.balance) {
          return `Balance for address ${address}: ${data.data.balance}`;
        } else if (data && data.status === 'Success') {
          return `Balance query successful for ${address}. Response: ${JSON.stringify(data)}`;
        } else {
          return `Balance query completed. Status: ${data?.status || 'unknown'}, Data: ${JSON.stringify(data)}`;
        }
      } catch (apiError: any) {
        console.error("[SDK] ❌ Error fetching balance via Developer Platform API:", apiError);
        console.log("[SDK] Falling back to direct RPC call...");
        // Fallback to RPC
        return await queryBlockchainViaRPC(query);
      }
    }
    
    // Default: return address info
    return `Address ${address} found in query. Use Developer Platform API methods to query specific data.`;
  } catch (error: any) {
    console.error("[SDK] ❌ Error in API blockchain query:", error);
    console.log("[SDK] Falling back to direct RPC call...");
    // Fallback to RPC
    return await queryBlockchainViaRPC(query);
  }
}

/**
 * Execute blockchain query using Crypto.com Developer Platform Client SDK directly
 * Uses SDK methods (Wallet.balance()) which handle authentication internally
 * No RPC fallback - throws error if SDK fails
 */
async function queryBlockchainDirectly(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available - API key missing");
  }
  
  const { Wallet } = sdk;
  
  // Extract address from query (look for 0x... pattern)
  const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) {
    throw new Error("Could not find a valid Ethereum address in the query. Please provide an address starting with 0x.");
  }
  
  const address = addressMatch[0];
  console.log(`[SDK] Using Developer Platform Client SDK (Wallet.balance) for address: ${address}`);
  
  // Use SDK method - it handles authentication internally
  const balance = await Wallet.balance(address);
  console.log(`[SDK] ✅ Balance fetched via Developer Platform SDK:`, balance);
  
  if (balance && balance.data && balance.data.balance) {
    return `Balance for address ${address}: ${balance.data.balance}`;
  } else if (balance && balance.status === 'Success') {
    return `Balance query successful for ${address}. Response: ${JSON.stringify(balance)}`;
  } else if (balance && balance.status) {
    return `Balance query completed. Status: ${balance.status}, Response: ${JSON.stringify(balance)}`;
  } else {
    return `Balance query completed. Response: ${JSON.stringify(balance)}`;
  }
}

/**
 * Initialize Developer Platform Client SDK
 */
export function initDeveloperPlatformSDK(): { Client: any; Transaction: any; Token: any; Wallet: any; Exchange: any; Block: any; Defi: any; CronosID: any } | null {
  try {
    const { Client, Transaction, Token, Wallet, Exchange, Block, Defi, CronosID } = require("@crypto.com/developer-platform-client");
    const developerPlatformApiKey = process.env.CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY || process.env.CRONOS_TESTNET_EXPLORER_KEY;
    
    if (!developerPlatformApiKey) {
      console.log("[SDK] No Developer Platform API key available");
      return null;
    }
    
    // Make sure Client is initialized
    try {
      // Provider is required for Token.transfer() magic links
      // Provider should be a URL (e.g., SSO wallet URL or provider endpoint)
      const provider = process.env.CRYPTO_COM_PROVIDER || process.env.CRYPTO_COM_SSO_WALLET_URL;
      
      const initConfig: any = {
        apiKey: developerPlatformApiKey,
      };
      
      // Add provider if available (required for Token.transfer() magic links)
      // Provider is optional in Client.init() but required for Token.transfer()
      if (provider) {
        initConfig.provider = provider;
        console.log(`[SDK] Client initialized with provider: ${provider.substring(0, 50)}...`);
      } else {
        console.warn(`[SDK] ⚠️ CRYPTO_COM_PROVIDER or CRYPTO_COM_SSO_WALLET_URL not set`);
        console.warn(`[SDK] ⚠️ Token.transfer() requires provider URL - see PROVIDER_URL_GUIDE.md`);
        console.warn(`[SDK] ⚠️ Other SDK functions (balance, transactions) will work without provider`);
      }
      
      Client.init(initConfig);
    } catch (initError) {
      console.warn("[SDK] Client already initialized or init failed:", initError);
    }
    
    return { Client, Transaction, Token, Wallet, Exchange, Block, Defi, CronosID };
  } catch (error) {
    console.error("[SDK] ❌ Failed to load Developer Platform SDK:", error);
    return null;
  }
}

/**
 * Query transactions using Developer Platform Client SDK Transaction module
 * Uses Transaction.getTransactionsByAddress() and Transaction.getTransactionCount()
 */
async function queryTransactionsViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Transaction } = sdk;
  
  // Extract address from query (look for 0x... pattern)
  const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) {
    throw new Error("Could not find a valid Ethereum address in the query. Please provide an address starting with 0x.");
  }
  
  const address = addressMatch[0];
  console.log(`[SDK] Using Developer Platform Client SDK (Transaction module) for address: ${address}`);
  
  // Try to get transaction count first
  const txCount = await Transaction.getTransactionCount(address);
  console.log(`[SDK] ✅ Transaction count fetched via SDK: ${txCount}`);
  
  // Try to get recent transactions
  let transactionsInfo = "";
  try {
    const transactions = await Transaction.getTransactionsByAddress(address, { limit: 10 });
    if (transactions && transactions.data && Array.isArray(transactions.data) && transactions.data.length > 0) {
      transactionsInfo = `\nRecent transactions:\n`;
      transactions.data.slice(0, 5).forEach((tx: any, index: number) => {
        transactionsInfo += `${index + 1}. Hash: ${tx.hash || tx.transactionHash || 'N/A'}\n`;
        if (tx.blockNumber) transactionsInfo += `   Block: ${tx.blockNumber}\n`;
        if (tx.timestamp) transactionsInfo += `   Time: ${new Date(tx.timestamp * 1000).toISOString()}\n`;
      });
    }
  } catch (txListError) {
    console.log("[SDK] Could not fetch transaction list, but count is available");
  }
  
  return `Transaction information for address ${address}:\n` +
         `- Total transaction count: ${txCount}\n` +
         `${transactionsInfo}` +
         `\nFor detailed transaction history, visit: https://explorer.cronos.org/testnet/address/${address}`;
}

/**
 * Query transaction by hash using SDK
 */
async function queryTransactionByHash(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Transaction } = sdk;
  
  // Extract transaction hash from query (look for 0x... pattern, 66 chars)
  const hashMatch = query.match(/0x[a-fA-F0-9]{64}/);
  if (!hashMatch) {
    throw new Error("Could not find a valid transaction hash in the query. Please provide a hash starting with 0x.");
  }
  
  const hash = hashMatch[0];
  console.log(`[SDK] Using Developer Platform Client SDK (Transaction.getTransactionByHash) for hash: ${hash}`);
  
  const txResponse = await Transaction.getTransactionByHash(hash);
  console.log(`[SDK] ✅ Transaction fetched via SDK`);
  console.log(`[SDK] Transaction response type:`, typeof txResponse);
  console.log(`[SDK] Transaction response keys:`, txResponse ? Object.keys(txResponse) : 'null');
  
  // SDK response structure: { status: "Success", data: { transaction: {...} } } or direct object
  let tx: any = {};
  if (txResponse?.data) {
    // Check if data has a nested 'transaction' object (SDK wraps it)
    if (txResponse.data.transaction) {
      tx = txResponse.data.transaction;
      console.log(`[SDK] Transaction found in data.transaction`);
    } else {
      tx = txResponse.data;
      console.log(`[SDK] Transaction data directly in data`);
    }
    console.log(`[SDK] Transaction data keys:`, Object.keys(tx));
    console.log(`[SDK] Transaction from:`, tx.from);
    console.log(`[SDK] Transaction to:`, tx.to);
    console.log(`[SDK] Transaction blockNumber:`, tx.blockNumber);
    console.log(`[SDK] Transaction value:`, tx.value);
  } else if (txResponse) {
    tx = txResponse;
  }
  
  // Log full structure for debugging (truncated)
  console.log(`[SDK] Transaction data sample:`, JSON.stringify(tx, null, 2).substring(0, 800));
  
  // Parse transaction fields first - try multiple possible field names from SDK
  // Handle BigNumber/string conversions
  const from = tx.from || tx.fromAddress || tx.sender || 'N/A';
  const to = tx.to || tx.toAddress || tx.recipient || tx.contractAddress || 'N/A';
  
  // Value might be in wei, hex, BigNumber, or already formatted
  let valueRaw = tx.value || tx.amount || tx.valueWei || '0';
  let value: string;
  
  // Handle BigNumber objects
  if (valueRaw && typeof valueRaw === 'object' && valueRaw.toString) {
    valueRaw = valueRaw.toString();
  }
  
  if (typeof valueRaw === 'string' && valueRaw.startsWith('0x')) {
    // Hex value - convert
    try {
      value = ethers.formatEther(valueRaw);
    } catch (e) {
      value = valueRaw;
    }
  } else if (typeof valueRaw === 'string' && !isNaN(Number(valueRaw)) && Number(valueRaw) > 0) {
    // String number - might be wei
    try {
      value = ethers.formatEther(valueRaw);
    } catch (e) {
      value = valueRaw;
    }
  } else if (typeof valueRaw === 'bigint' || typeof valueRaw === 'number') {
    // BigInt or number - convert
    try {
      value = ethers.formatEther(String(valueRaw));
    } catch (e) {
      value = String(valueRaw);
    }
  } else {
    value = String(valueRaw || '0');
  }
  
  // Block number - handle BigNumber/string conversions
  let blockNumber: string | number = tx.blockNumber || tx.block || tx.blockHeight || 'Pending';
  if (blockNumber && typeof blockNumber === 'object') {
    const blockNumAny = blockNumber as any;
    if (typeof blockNumAny.toString === 'function') {
      blockNumber = blockNumAny.toString();
    }
  }
  if (blockNumber && blockNumber !== 'Pending') {
    blockNumber = Number(blockNumber);
  }
  
  // Gas used - handle BigNumber/string conversions
  let gasUsed: string | number = tx.gasUsed || tx.gas || tx.gasLimit || 'N/A';
  if (gasUsed && typeof gasUsed === 'object') {
    const gasUsedAny = gasUsed as any;
    if (typeof gasUsedAny.toString === 'function') {
      gasUsed = gasUsedAny.toString();
    }
  }
  if (gasUsed && gasUsed !== 'N/A') {
    gasUsed = Number(gasUsed);
  }
  
  // Gas price - handle BigNumber/string conversions
  let gasPrice: string = 'N/A';
  if (tx.gasPrice) {
    let gasPriceRaw = tx.gasPrice;
    if (gasPriceRaw && typeof gasPriceRaw === 'object' && gasPriceRaw.toString) {
      gasPriceRaw = gasPriceRaw.toString();
    }
    try {
      gasPrice = ethers.formatUnits(String(gasPriceRaw), 'gwei') + ' gwei';
    } catch (e) {
      gasPrice = String(gasPriceRaw) + ' wei';
    }
  }
  
  // Get transaction status (after we have blockNumber)
  let status = "unknown";
  try {
    const txStatusResponse = await Transaction.getTransactionStatus(hash);
    console.log(`[SDK] Status response:`, txStatusResponse);
    const txStatus = txStatusResponse?.data || txStatusResponse || {};
    let statusRaw = txStatus.status || txStatusResponse?.status || tx?.status || "Success";
    console.log(`[SDK] Transaction status raw:`, statusRaw);
    
    // Map status codes: 1 = Success, 0 = Failed, null/undefined = Pending
    if (statusRaw === 1 || statusRaw === '1' || statusRaw === 'Success') {
      status = 'Success';
    } else if (statusRaw === 0 || statusRaw === '0' || statusRaw === 'Failed') {
      status = 'Failed';
    } else if (!statusRaw || statusRaw === 'null' || statusRaw === 'undefined') {
      status = blockNumber && blockNumber !== 'Pending' ? 'Success' : 'Pending';
    } else {
      status = String(statusRaw);
    }
    console.log(`[SDK] Transaction status determined:`, status);
  } catch (e) {
    console.warn(`[SDK] Could not get transaction status:`, e);
    // If status call fails, try to infer from transaction data
    if (blockNumber && blockNumber !== 'Pending') {
      status = 'Success';
    } else {
      status = 'Pending';
    }
  }
  
  // Format value properly - if it's a number string, add CRO
  let formattedValue = value;
  if (value !== '0' && value !== 'N/A' && !value.includes(' ')) {
    try {
      const numValue = parseFloat(value);
      if (numValue > 0) {
        formattedValue = numValue.toFixed(6) + ' CRO';
      }
    } catch (e) {
      // Keep original value
    }
  }
  
  return `Transaction details for hash ${hash}:\n` +
         `- Status: ${status}\n` +
         `- Block: ${blockNumber}\n` +
         `- From: ${from}\n` +
         `- To: ${to}\n` +
         `- Value: ${formattedValue}\n` +
         `- Gas Used: ${gasUsed}\n` +
         (gasPrice !== 'N/A' ? `- Gas Price: ${gasPrice}\n` : '') +
         `\nFull details: https://explorer.cronos.org/testnet/tx/${hash}`;
}

/**
 * Query gas price and fee data using SDK
 */
async function queryGasInfoViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Transaction } = sdk;
  
  console.log(`[SDK] Using Developer Platform Client SDK (Transaction module) for gas info`);
  
  const gasPrice = await Transaction.getGasPrice();
  console.log(`[SDK] ✅ Gas price fetched via SDK`);
  
  let feeData = null;
  try {
    feeData = await Transaction.getFeeData();
    console.log(`[SDK] ✅ Fee data fetched via SDK`);
  } catch (e) {
    console.log("[SDK] Fee data not available");
  }
  
  let result = `Current gas information on Cronos:\n` +
               `- Gas Price: ${gasPrice || 'N/A'}\n`;
  
  if (feeData) {
    result += `- Max Fee Per Gas: ${feeData.maxFeePerGas || 'N/A'}\n`;
    result += `- Max Priority Fee Per Gas: ${feeData.maxPriorityFeePerGas || 'N/A'}\n`;
  }
  
  return result;
}

/**
 * Query token balance using SDK Token module
 */
export async function queryTokenBalanceViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Token } = sdk;
  
  // Extract address and token address from query
  const addresses = query.match(/0x[a-fA-F0-9]{40}/g);
  if (!addresses || addresses.length < 1) {
    throw new Error("Could not find a valid Ethereum address in the query.");
  }
  
  const walletAddress = addresses[0];
  const tokenAddress = addresses[1] || null; // Optional token address
  
  console.log(`[SDK] Using Developer Platform Client SDK (Token module) for address: ${walletAddress}`);
  
  if (tokenAddress) {
    // Specific ERC-20 token balance
    console.log(`[SDK] Fetching ERC-20 token balance for ${tokenAddress}...`);
    try {
      const balance = await Token.getERC20TokenBalance(walletAddress, tokenAddress);
      console.log(`[SDK] ✅ ERC-20 token balance fetched via SDK:`, balance);
      
      // Try to get token metadata for decimals
      let decimals = 18; // Default
      try {
        const metadata = await Token.getERC20Metadata(tokenAddress);
        if (metadata && metadata.data && metadata.data.decimals) {
          decimals = metadata.data.decimals;
        }
      } catch (e) {
        console.log(`[SDK] Could not fetch token metadata, using default decimals: ${decimals}`);
      }
      
      // Convert raw balance to human-readable
      const rawBalance = BigInt(balance?.data?.balance || balance || '0');
      const humanReadableBalance = Number(rawBalance) / Math.pow(10, decimals);
      
      return `ERC-20 Token Balance:\n` +
             `- Wallet: ${walletAddress}\n` +
             `- Token Contract: ${tokenAddress}\n` +
             `- Raw Balance: ${rawBalance.toString()}\n` +
             `- Balance: ${humanReadableBalance.toFixed(6)} tokens\n` +
             `- Decimals: ${decimals}`;
    } catch (error: any) {
      console.error(`[SDK] ❌ Error fetching ERC-20 token balance:`, error);
      throw new Error(`Failed to fetch token balance: ${error.message || 'Unknown error'}`);
    }
  } else {
    // Try to detect token name from query (USDC, USDT, etc.)
    const tokenName = query.match(/\b(USDC|USDT|ETH|BTC|CRO)\b/i)?.[0]?.toUpperCase();
    
    if (tokenName) {
      // For now, return a message that specific token queries need the token address
      return `To check ${tokenName} balance, please provide the token contract address.\n` +
             `Example: "What is the USDC balance of ${walletAddress}? Token address: 0x..."`;
    }
    
    // Get native token balance as fallback
    try {
      const nativeBalance = await Token.getNativeTokenBalance(walletAddress);
      console.log(`[SDK] ✅ Native token balance fetched via SDK`);
      return `Native token balance for address ${walletAddress}:\n` +
             `- Balance: ${nativeBalance?.data?.balance || nativeBalance || 'N/A'}\n` +
             `\nNote: For ERC-20 token balances, please provide the token contract address.`;
    } catch (e) {
      return `Token balance query for ${walletAddress}. Please specify a token contract address for ERC-20 token queries.`;
    }
  }
}

/**
 * Query token transfers using SDK Token module
 */
async function queryTokenTransfersViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Token } = sdk;
  
  // Extract address from query
  const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) {
    throw new Error("Could not find a valid Ethereum address in the query.");
  }
  
  const address = addressMatch[0];
  console.log(`[SDK] Using Developer Platform Client SDK (Token.getTokenTransfers) for address: ${address}`);
  
  const transfers = await Token.getTokenTransfers(address, { limit: 10 });
  console.log(`[SDK] ✅ Token transfers fetched via SDK`);
  
  if (transfers && transfers.data && Array.isArray(transfers.data) && transfers.data.length > 0) {
    let result = `Token transfers for address ${address}:\n\n`;
    transfers.data.slice(0, 10).forEach((transfer: any, index: number) => {
      result += `${index + 1}. Token: ${transfer.tokenAddress || transfer.token || 'N/A'}\n`;
      result += `   Amount: ${transfer.amount || 'N/A'}\n`;
      result += `   From: ${transfer.from || 'N/A'}\n`;
      result += `   To: ${transfer.to || 'N/A'}\n`;
      if (transfer.blockNumber) result += `   Block: ${transfer.blockNumber}\n`;
      result += `\n`;
    });
    return result;
  }
  
  return `No token transfers found for address ${address}`;
}

/**
 * Create a new wallet using SDK Wallet module
 */
async function createWalletViaSDK(): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Wallet } = sdk;
  
  console.log(`[SDK] Using Developer Platform Client SDK (Wallet.create) to create new wallet`);
  
  const wallet = await Wallet.create();
  console.log(`[SDK] ✅ Wallet created via SDK`);
  
  if (wallet && wallet.status === 'Success' && wallet.data) {
    return `New wallet created successfully:\n` +
           `- Address: ${wallet.data.address}\n` +
           `- Private Key: ${wallet.data.privateKey}\n` +
           `- Mnemonic: ${wallet.data.mnemonic}\n\n` +
           `⚠️ IMPORTANT: Save this information securely. The private key and mnemonic will not be shown again.\n` +
           `⚠️ SECURITY: Never share your private key or mnemonic with anyone.`;
  }
  
  return `Wallet creation completed. Response: ${JSON.stringify(wallet, null, 2)}`;
}

/**
 * Get all tickers from Crypto.com Exchange using SDK Exchange module
 * Example: "Get all tickers" -> returns all available trading pairs
 */
export async function getAllTickersViaSDK(): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Exchange } = sdk;
  
  if (!Exchange) {
    throw new Error("Exchange module not available in SDK");
  }
  
  console.log(`[SDK] Using Developer Platform Client SDK (Exchange.getAllTickers) to get all tickers`);
  
  try {
    const tickers = await Exchange.getAllTickers();
    console.log(`[SDK] ✅ All tickers fetched via SDK`);
    
    if (tickers && tickers.data && Array.isArray(tickers.data) && tickers.data.length > 0) {
      let result = `Here are the current tickers available on Crypto.com Exchange:\n\n`;
      
      // Format first 20 tickers (to avoid overwhelming response)
      const tickerData = tickers.data as any[];
      const displayCount = Math.min(20, tickerData.length);
      tickerData.slice(0, displayCount).forEach((ticker: any, index: number) => {
        result += `${index + 1}. **${ticker.instrument_name || ticker.instrument || 'N/A'}**\n`;
        if (ticker.last_price) result += `   - Last Price: $${parseFloat(String(ticker.last_price)).toFixed(2)}\n`;
        if (ticker.high_price_24h) result += `   - High (24h): $${parseFloat(String(ticker.high_price_24h)).toFixed(2)}\n`;
        if (ticker.low_price_24h) result += `   - Low (24h): $${parseFloat(String(ticker.low_price_24h)).toFixed(2)}\n`;
        if (ticker.base_volume_24h) result += `   - Volume (24h): ${parseFloat(String(ticker.base_volume_24h)).toFixed(2)}\n`;
        if (ticker.price_change_percent_24h) {
          const change = parseFloat(String(ticker.price_change_percent_24h));
          const changeSymbol = change >= 0 ? '+' : '';
          result += `   - Change (24h): ${changeSymbol}${change.toFixed(2)}%\n`;
        }
        result += `\n`;
      });
      
      if (tickerData.length > displayCount) {
        result += `\n... and ${tickerData.length - displayCount} more tickers available.\n`;
      }
      
      if (tickerData.length > displayCount) {
        result += `To get ticker information for a specific instrument, ask: "What's the ticker information of <instrument_name>"\n`;
      }
      
      return result;
    }
    
    return `No tickers found. Response: ${JSON.stringify(tickers, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling Exchange.getAllTickers():`, error);
    
    // If SDK doesn't have getAllTickers method, try alternative
    if (error.message && (error.message.includes('getAllTickers') || error.message.includes('not a function'))) {
      // Try alternative method name
      try {
        const tickers = await Exchange.getTickers();
        console.log(`[SDK] ✅ All tickers fetched via Exchange.getTickers()`);
        return formatTickersResponse(tickers);
      } catch (altError) {
        return `⚠️ Exchange.getAllTickers() method not available in SDK version.\n` +
               `Error: ${error.message || 'Unknown error'}\n\n` +
               `💡 Alternative: Use REST API endpoint: https://api.crypto.com/v2/public/get-ticker`;
      }
    }
    
    throw new Error(`Failed to get all tickers: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Get ticker by instrument name using SDK Exchange module
 * Example: "What's the ticker information of BTC_USDT"
 */
export async function getTickerByInstrumentViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Exchange } = sdk;
  
  if (!Exchange) {
    throw new Error("Exchange module not available in SDK");
  }
  
  // Extract instrument name from query
  // Patterns: "ticker information of BTC_USDT", "ticker for ETH_USD", etc.
  const instrumentMatch = query.match(/(?:ticker|instrument|pair).*?(?:of|for|:)\s*([A-Z0-9_]+)/i) ||
                          query.match(/([A-Z0-9_]+_[A-Z0-9_]+)/);
  
  if (!instrumentMatch) {
    throw new Error("Could not parse instrument name from query. Format: 'What's the ticker information of BTC_USDT'");
  }
  
  const instrumentName = instrumentMatch[1].toUpperCase();
  
  console.log(`[SDK] Using Developer Platform Client SDK (Exchange.getTickerByInstrument) for: ${instrumentName}`);
  
  try {
    const ticker = await Exchange.getTickerByInstrument(instrumentName);
    console.log(`[SDK] ✅ Ticker fetched via SDK`);
    
    if (ticker && ticker.data) {
      const data = ticker.data;
      return `Here is the ticker information for the **${instrumentName}** trading pair:\n\n` +
             `- **Instrument Name:** ${instrumentName}\n` +
             (data.high_price_24h ? `- **High Price (24h):** $${parseFloat(data.high_price_24h).toFixed(2)}\n` : '') +
             (data.low_price_24h ? `- **Low Price (24h):** $${parseFloat(data.low_price_24h).toFixed(2)}\n` : '') +
             (data.last_price ? `- **Last Price:** $${parseFloat(data.last_price).toFixed(2)}\n` : '') +
             (data.base_volume_24h ? `- **24h Volume:** ${parseFloat(data.base_volume_24h).toFixed(2)}\n` : '') +
             (data.quote_volume_24h ? `- **24h Volume Value:** $${parseFloat(data.quote_volume_24h).toFixed(2)}\n` : '') +
             (data.price_change_percent_24h ? `- **Price Change (24h):** ${parseFloat(data.price_change_percent_24h).toFixed(2)}%\n` : '') +
             (data.best_bid ? `- **Best Bid:** $${parseFloat(data.best_bid).toFixed(2)}\n` : '') +
             (data.best_ask ? `- **Best Ask:** $${parseFloat(data.best_ask).toFixed(2)}\n` : '') +
             (data.open_interest ? `- **Open Interest:** ${parseFloat(data.open_interest).toFixed(2)}\n` : '') +
             (data.timestamp ? `- **Timestamp:** ${new Date(data.timestamp).toISOString()}\n` : '') +
             `\nIf you need further information, feel free to ask!`;
    }
    
    return `Ticker information for ${instrumentName}: ${JSON.stringify(ticker, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling Exchange.getTickerByInstrument():`, error);
    
    // Try alternative method names
    if (error.message && error.message.includes('not a function')) {
      try {
        const ticker = await Exchange.getTicker(instrumentName);
        return formatTickerResponse(instrumentName, ticker);
      } catch (altError) {
        // Fallback to REST API
        try {
          const response = await fetch(`https://api.crypto.com/v2/public/get-ticker?instrument_name=${instrumentName}`);
          const data = await response.json() as any;
          if (data.result && data.result.data && Array.isArray(data.result.data) && data.result.data[0]) {
            return formatTickerResponse(instrumentName, data.result.data[0]);
          }
        } catch (restError) {
          // Ignore REST fallback error
        }
      }
    }
    
    throw new Error(`Failed to get ticker for ${instrumentName}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Helper function to format tickers response
 */
function formatTickersResponse(tickers: any): string {
  if (!tickers || !tickers.data || !Array.isArray(tickers.data)) {
    return `No tickers found. Response: ${JSON.stringify(tickers, null, 2)}`;
  }
  
  let result = `Here are the current tickers available on Crypto.com Exchange:\n\n`;
  const displayCount = Math.min(20, tickers.data.length);
  
  tickers.data.slice(0, displayCount).forEach((ticker: any, index: number) => {
    result += `${index + 1}. **${ticker.instrument_name || ticker.instrument || 'N/A'}**\n`;
    if (ticker.last_price) result += `   - Last Price: $${parseFloat(ticker.last_price).toFixed(2)}\n`;
    if (ticker.high_price_24h) result += `   - High (24h): $${parseFloat(ticker.high_price_24h).toFixed(2)}\n`;
    if (ticker.low_price_24h) result += `   - Low (24h): $${parseFloat(ticker.low_price_24h).toFixed(2)}\n`;
    if (ticker.base_volume_24h) result += `   - Volume (24h): ${parseFloat(ticker.base_volume_24h).toFixed(2)}\n`;
    result += `\n`;
  });
  
  if (tickers.data.length > displayCount) {
    result += `\n... and ${tickers.data.length - displayCount} more tickers available.\n`;
  }
  
  return result;
}

/**
 * Helper function to format single ticker response
 */
function formatTickerResponse(instrumentName: string, ticker: any): string {
  return `Here is the ticker information for the **${instrumentName}** trading pair:\n\n` +
         `- **Instrument Name:** ${instrumentName}\n` +
         (ticker.high_price_24h ? `- **High Price (24h):** $${parseFloat(ticker.high_price_24h).toFixed(2)}\n` : '') +
         (ticker.low_price_24h ? `- **Low Price (24h):** $${parseFloat(ticker.low_price_24h).toFixed(2)}\n` : '') +
         (ticker.last_price ? `- **Last Price:** $${parseFloat(ticker.last_price).toFixed(2)}\n` : '') +
         (ticker.base_volume_24h ? `- **24h Volume:** ${parseFloat(ticker.base_volume_24h).toFixed(2)}\n` : '') +
         (ticker.price_change_percent_24h ? `- **Price Change (24h):** ${parseFloat(ticker.price_change_percent_24h).toFixed(2)}%\n` : '') +
         `\nIf you need further information, feel free to ask!`;
}

/**
 * Get block by tag using SDK Block module
 * Example: "Get latest block with detail" -> returns block data
 */
export async function getBlockByTagViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Block } = sdk;
  
  if (!Block) {
    throw new Error("Block module not available in SDK");
  }
  
  // Extract tag from query: "latest", "pending", "earliest", or block number
  let tag = "latest"; // default
  let txDetail = "false"; // default to transaction hashes only
  
  const queryLower = query.toLowerCase();
  
  if (queryLower.includes("pending")) {
    tag = "pending";
  } else if (queryLower.includes("earliest")) {
    tag = "earliest";
  } else if (queryLower.includes("latest")) {
    tag = "latest";
  } else {
    // Check for block number
    const blockNumberMatch = query.match(/\b(\d+)\b/);
    if (blockNumberMatch) {
      tag = blockNumberMatch[1];
    }
  }
  
  // Check if user wants full transaction details
  if (queryLower.includes("detail") || queryLower.includes("with detail") || queryLower.includes("full")) {
    txDetail = "true";
  }
  
  console.log(`[SDK] Using Developer Platform Client SDK (Block.getBlockByTag) for tag: ${tag}, txDetail: ${txDetail}`);
  
  try {
    const block = await Block.getBlockByTag(tag, txDetail);
    console.log(`[SDK] ✅ Block fetched via SDK`);
    
    if (block && block.data) {
      const data = block.data;
      let result = `The ${tag} block data${txDetail === "true" ? " with details" : ""} is as follows:\n\n`;
      
      result += `- **Block Number:** ${data.number || data.blockNumber || 'N/A'}\n`;
      result += `- **Block Hash:** ${data.hash || 'N/A'}\n`;
      result += `- **Parent Hash:** ${data.parentHash || 'N/A'}\n`;
      result += `- **Timestamp:** ${data.timestamp ? new Date(Number(data.timestamp) * 1000).toISOString() : 'N/A'}\n`;
      result += `- **Transactions Root:** ${data.transactionsRoot || 'N/A'}\n`;
      result += `- **Receipts Root:** ${data.receiptsRoot || 'N/A'}\n`;
      result += `- **State Root:** ${data.stateRoot || 'N/A'}\n`;
      result += `- **Gas Limit:** ${data.gasLimit || 'N/A'}\n`;
      result += `- **Gas Used:** ${data.gasUsed || 'N/A'}\n`;
      if (data.miner) result += `- **Miner:** ${data.miner}\n`;
      if (data.difficulty) result += `- **Difficulty:** ${data.difficulty}\n`;
      if (data.totalDifficulty) result += `- **Total Difficulty:** ${data.totalDifficulty}\n`;
      if (data.gasPrice) result += `- **Gas Price:** ${data.gasPrice}\n`;
      if (data.baseFeePerGas) result += `- **Base Fee Per Gas:** ${data.baseFeePerGas}\n`;
      if (data.nonce) result += `- **Nonce:** ${data.nonce}\n`;
      
      // Transactions
      if (data.transactions && Array.isArray(data.transactions) && data.transactions.length > 0) {
        result += `\n**Transactions:**\n`;
        const displayCount = Math.min(5, data.transactions.length);
        data.transactions.slice(0, displayCount).forEach((tx: any, index: number) => {
          if (txDetail === "true" && typeof tx === 'object') {
            // Full transaction object
            result += `\n${index + 1}. Transaction:\n`;
            result += `   - **Hash:** ${tx.hash || 'N/A'}\n`;
            result += `   - **From:** ${tx.from || 'N/A'}\n`;
            result += `   - **To:** ${tx.to || 'N/A'}\n`;
            result += `   - **Value:** ${tx.value || '0'}\n`;
            result += `   - **Gas:** ${tx.gas || 'N/A'}\n`;
            if (tx.transactionIndex !== undefined) result += `   - **Transaction Index:** ${tx.transactionIndex}\n`;
            if (tx.maxFeePerGas) result += `   - **Max Fee Per Gas:** ${tx.maxFeePerGas}\n`;
            if (tx.maxPriorityFeePerGas) result += `   - **Max Priority Fee Per Gas:** ${tx.maxPriorityFeePerGas}\n`;
          } else {
            // Transaction hash only
            result += `   ${index + 1}. ${tx}\n`;
          }
        });
        if (data.transactions.length > displayCount) {
          result += `\n... and ${data.transactions.length - displayCount} more transactions.\n`;
        }
      } else {
        result += `\n**Transactions:** None\n`;
      }
      
      result += `\nIf you need further information or specific details, please let me know!`;
      return result;
    }
    
    return `Block data for ${tag}: ${JSON.stringify(block, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling Block.getBlockByTag():`, error);
    throw new Error(`Failed to get block by tag ${tag}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Get whitelisted tokens for a DeFi protocol using SDK Defi module
 * Example: "Get whitelisted tokens of protocol VVS"
 */
export async function getWhitelistedTokensViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Defi } = sdk;
  
  if (!Defi) {
    throw new Error("Defi module not available in SDK");
  }
  
  // Extract protocol name from query
  const protocolMatch = query.match(/protocol\s+(\w+)/i) || query.match(/(?:VVS|H2|defi)\s+protocol/i);
  if (!protocolMatch) {
    throw new Error("Could not parse protocol name from query. Format: 'Get whitelisted tokens of protocol VVS'");
  }
  
  const protocol = protocolMatch[1]?.toUpperCase() || (query.toUpperCase().includes('VVS') ? 'VVS' : 'H2');
  
  console.log(`[SDK] Using Developer Platform Client SDK (Defi.getWhitelistedTokens) for protocol: ${protocol}`);
  
  try {
    const tokens = await Defi.getWhitelistedTokens(protocol);
    console.log(`[SDK] ✅ Whitelisted tokens fetched via SDK`);
    
    if (tokens && tokens.data && Array.isArray(tokens.data) && tokens.data.length > 0) {
      let result = `Here are the whitelisted tokens for the **${protocol}** protocol:\n\n`;
      
      tokens.data.forEach((token: any, index: number) => {
        result += `${index + 1}. **${token.name || token.symbol || 'Unknown Token'}**\n`;
        if (token.address) {
          const explorerLink = `https://explorer.cronos.org/testnet/address/${token.address}`;
          result += `   - Address: [${token.address}](${explorerLink})\n`;
        }
        if (token.decimal !== undefined) result += `   - Decimal: ${token.decimal}\n`;
        if (token.swappable !== undefined) result += `   - Swappable: ${token.swappable}\n`;
        if (token.logo || token.img) {
          result += `   - Logo: ![${token.name || token.symbol}](${token.logo || token.img})\n`;
        }
        result += `\n`;
      });
      
      result += `Feel free to ask if you need more information about any specific token!`;
      return result;
    }
    
    return `No whitelisted tokens found for ${protocol}. Response: ${JSON.stringify(tokens, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling Defi.getWhitelistedTokens():`, error);
    throw new Error(`Failed to get whitelisted tokens for ${protocol}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Get all farms for a DeFi protocol using SDK Defi module
 * Example: "Get all farms of protocol VVS"
 */
export async function getAllFarmsViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Defi } = sdk;
  
  if (!Defi) {
    throw new Error("Defi module not available in SDK");
  }
  
  // Extract protocol name from query
  const protocolMatch = query.match(/protocol\s+(\w+)/i) || query.match(/(?:VVS|H2|defi)\s+protocol/i);
  if (!protocolMatch) {
    throw new Error("Could not parse protocol name from query. Format: 'Get all farms of protocol VVS'");
  }
  
  const protocol = protocolMatch[1]?.toUpperCase() || (query.toUpperCase().includes('VVS') ? 'VVS' : 'H2');
  
  console.log(`[SDK] Using Developer Platform Client SDK (Defi.getAllFarms) for protocol: ${protocol}`);
  
  try {
    const farms = await Defi.getAllFarms(protocol);
    console.log(`[SDK] ✅ All farms fetched via SDK`);
    
    if (farms && farms.data && Array.isArray(farms.data) && farms.data.length > 0) {
      let result = `Here are the farms available for the **${protocol}** protocol:\n\n`;
      
      farms.data.forEach((farm: any, index: number) => {
        result += `${index + 1}. **${farm.symbol || farm.farmSymbol || 'Unknown Farm'}**\n`;
        if (farm.lpAddress) result += `   - LP Address: ${farm.lpAddress}\n`;
        if (farm.baseAPR !== undefined) result += `   - Base APR: ${farm.baseAPR}%\n`;
        if (farm.baseAPY !== undefined) result += `   - Base APY: ${farm.baseAPY}%\n`;
        if (farm.rewardStartDate) result += `   - Reward Start Date: ${farm.rewardStartDate}\n`;
        if (farm.chain) result += `   - Chain: ${farm.chain}\n`;
        result += `\n`;
      });
      
      return result;
    }
    
    return `No farms found for ${protocol}. Response: ${JSON.stringify(farms, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling Defi.getAllFarms():`, error);
    throw new Error(`Failed to get all farms for ${protocol}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Get farm by symbol for a DeFi protocol using SDK Defi module
 * Example: "Get farm of protocol VVS symbol CRO-GOLD"
 */
export async function getFarmBySymbolViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Defi } = sdk;
  
  if (!Defi) {
    throw new Error("Defi module not available in SDK");
  }
  
  // Extract protocol and symbol from query
  const protocolMatch = query.match(/protocol\s+(\w+)/i) || query.match(/(?:VVS|H2|defi)\s+protocol/i);
  const symbolMatch = query.match(/symbol\s+([A-Z0-9-]+)/i) || query.match(/([A-Z0-9-]+-[A-Z0-9-]+)/);
  
  if (!protocolMatch || !symbolMatch) {
    throw new Error("Could not parse protocol or symbol from query. Format: 'Get farm of protocol VVS symbol CRO-GOLD'");
  }
  
  const protocol = protocolMatch[1]?.toUpperCase() || (query.toUpperCase().includes('VVS') ? 'VVS' : 'H2');
  const symbol = symbolMatch[1]?.toUpperCase();
  
  console.log(`[SDK] Using Developer Platform Client SDK (Defi.getFarmBySymbol) for protocol: ${protocol}, symbol: ${symbol}`);
  
  try {
    const farm = await Defi.getFarmBySymbol(protocol, symbol);
    console.log(`[SDK] ✅ Farm fetched via SDK`);
    
    if (farm && farm.data) {
      const data = farm.data;
      let result = `Here is the information for the farm with the symbol **${symbol}** in the **${protocol}** protocol:\n\n`;
      
      if (data.farmId !== undefined) result += `- **Farm ID:** ${data.farmId}\n`;
      if (data.lpSymbol) result += `- **LP Symbol:** ${data.lpSymbol}\n`;
      if (data.lpAddress) {
        const explorerLink = `https://explorer.cronos.org/testnet/address/${data.lpAddress}`;
        result += `- **LP Address:** [${data.lpAddress}](${explorerLink})\n`;
      }
      
      if (data.token) {
        result += `- **Token:**\n`;
        if (data.token.symbol) result += `  - Symbol: ${data.token.symbol}\n`;
        if (data.token.address) {
          const tokenExplorerLink = `https://explorer.cronos.org/testnet/address/${data.token.address}`;
          result += `  - Address: [${data.token.address}](${tokenExplorerLink})\n`;
        }
      }
      
      if (data.quoteToken) {
        result += `- **Quote Token:**\n`;
        if (data.quoteToken.symbol) result += `  - Symbol: ${data.quoteToken.symbol}\n`;
        if (data.quoteToken.address) {
          const quoteExplorerLink = `https://explorer.cronos.org/testnet/address/${data.quoteToken.address}`;
          result += `  - Address: [${data.quoteToken.address}](${quoteExplorerLink})\n`;
        }
      }
      
      if (data.version) result += `- **Version:** ${data.version}\n`;
      if (data.rewardStartDate) result += `- **Reward Start Date:** ${data.rewardStartDate}\n`;
      if (data.finished !== undefined) result += `- **Finished:** ${data.finished}\n`;
      if (data.migrated !== undefined) result += `- **Migrated:** ${data.migrated}\n`;
      if (data.boostEnabled !== undefined) result += `- **Boost Enabled:** ${data.boostEnabled}\n`;
      if (data.autoHarvestEnabled !== undefined) result += `- **Auto Harvest Enabled:** ${data.autoHarvestEnabled}\n`;
      if (data.chain) result += `- **Chain:** ${data.chain}\n`;
      if (data.chainId) result += `- **Chain ID:** ${data.chainId}\n`;
      if (data.baseAPR !== undefined) result += `- **Base APR:** ${data.baseAPR}%\n`;
      if (data.baseAPY !== undefined) result += `- **Base APY:** ${data.baseAPY}%\n`;
      if (data.lpAPR !== undefined) result += `- **LP APR:** ${data.lpAPR}%\n`;
      if (data.lpAPY !== undefined) result += `- **LP APY:** ${data.lpAPY}%\n`;
      
      result += `\nIf you need further assistance or more details, feel free to ask!`;
      return result;
    }
    
    return `Farm information for ${symbol} in ${protocol}: ${JSON.stringify(farm, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling Defi.getFarmBySymbol():`, error);
    throw new Error(`Failed to get farm ${symbol} for ${protocol}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Resolve CronosID name to address using SDK CronosID module
 * Example: "Resolve CronosId name xyz.cro"
 */
export async function resolveCronosIdNameViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { CronosID } = sdk;
  
  if (!CronosID) {
    throw new Error("CronosID module not available in SDK");
  }
  
  // Extract CronosID name from query (e.g., "xyz.cro")
  const nameMatch = query.match(/([\w-]+\.cro)/i) || query.match(/name\s+([\w-]+\.cro)/i);
  if (!nameMatch) {
    throw new Error("Could not parse CronosID name from query. Format: 'Resolve CronosId name xyz.cro'");
  }
  
  const name = nameMatch[1];
  
  console.log(`[SDK] Using Developer Platform Client SDK (CronosID.resolveName) for name: ${name}`);
  
  try {
    const result = await CronosID.resolveName(name);
    console.log(`[SDK] ✅ CronosID resolved via SDK`);
    
    if (result && result.data && result.data.address) {
      return `The CronosId name **${name}** has been successfully resolved to the blockchain address: **${result.data.address}**`;
    }
    
    return `CronosID resolution for ${name}: ${JSON.stringify(result, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling CronosID.resolveName():`, error);
    throw new Error(`Failed to resolve CronosID ${name}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Lookup CronosID for an address using SDK CronosID module
 * Example: "Lookup CronosId for 0x..."
 */
export async function lookupCronosIdAddressViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { CronosID } = sdk;
  
  if (!CronosID) {
    throw new Error("CronosID module not available in SDK");
  }
  
  // Extract address from query
  const addressMatch = query.match(/0x[a-fA-F0-9]{40}/);
  if (!addressMatch) {
    throw new Error("Could not parse address from query. Format: 'Lookup CronosId for 0x...'");
  }
  
  const address = addressMatch[0];
  
  console.log(`[SDK] Using Developer Platform Client SDK (CronosID.lookupAddress) for address: ${address}`);
  
  try {
    const result = await CronosID.lookupAddress(address);
    console.log(`[SDK] ✅ CronosID lookup completed via SDK`);
    
    if (result && result.data && result.data.name) {
      return `The CronosId for the address **${address}** is **${result.data.name}**`;
    }
    
    return `CronosID lookup for ${address}: ${JSON.stringify(result, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[SDK] ❌ Error calling CronosID.lookupAddress():`, error);
    throw new Error(`Failed to lookup CronosID for ${address}: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Wrap native tokens into wrapped tokens using SDK Token module
 * Example: "Wrap 10 CRO token" -> wraps 10 CRO into WCRO
 */
export async function wrapTokenViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Token } = sdk;
  
  // Check if provider is configured (required for Token.wrap() magic links)
  const provider = process.env.CRYPTO_COM_PROVIDER || process.env.CRYPTO_COM_SSO_WALLET_URL;
  if (!provider) {
    console.warn(`[Wrap] ⚠️ CRYPTO_COM_PROVIDER or CRYPTO_COM_SSO_WALLET_URL not set`);
    console.warn(`[Wrap] ⚠️ Token.wrap() requires provider URL (AI Magic Signer app)`);
    console.warn(`[Wrap] ⚠️ Please run: git clone https://github.com/crypto-com/cdc-ai-agent-signer-app && cd cdc-ai-agent-signer-app && npm install && npm run dev`);
    console.warn(`[Wrap] ⚠️ Then set CRYPTO_COM_PROVIDER=http://localhost:5173 in your .env file`);
  }
  
  // Parse wrap request: "Wrap 10 CRO token" or "wrap 5 CRO"
  const wrapMatch = query.match(/wrap\s+(\d+(?:\.\d+)?)\s+(\w+)/i);
  
  if (!wrapMatch) {
    throw new Error("Could not parse wrap request. Format: 'Wrap X CRO token' or 'wrap X CRO'");
  }
  
  const amount = parseFloat(wrapMatch[1]);
  const tokenSymbol = wrapMatch[2].toUpperCase();
  
  // Validate it's a native token (CRO, TCRO, etc.)
  const isNativeToken = tokenSymbol === 'CRO' || tokenSymbol === 'TCRO' || tokenSymbol === 'NATIVE';
  
  if (!isNativeToken) {
    throw new Error(`Wrapping is only available for native tokens (CRO, TCRO). You specified: ${tokenSymbol}`);
  }
  
  console.log(`[Wrap] Attempting SDK Token.wrap() for native token:`, {
    amount,
    tokenSymbol,
    providerConfigured: !!provider,
  });
  
  try {
    // Call SDK's Token.wrap() method
    // According to SDK docs: Token.wrap({ amount: number })
    const wrapResponse = await Token.wrap({
      amount: amount
    });
    
    console.log(`[Wrap] ✅ Token.wrap() response:`, wrapResponse);
    
    if (wrapResponse && wrapResponse.data) {
      // Check if it returns a magic link (like transfer does)
      if (wrapResponse.data.url || wrapResponse.data.magicLink) {
        const magicLink = wrapResponse.data.url || wrapResponse.data.magicLink;
        // Format as markdown link - ensure proper markdown syntax
        return `📦 **Token Wrap Request Created**\n\n` +
               `**Amount:** ${amount} ${tokenSymbol}\n` +
               `**Action:** Wrap ${amount} native ${tokenSymbol} → ${amount} WCRO (Wrapped CRO)\n` +
               `**Contract:** \`0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD4\` (WCRO on Cronos Testnet)\n\n` +
               `🔗 **Complete Transaction:**\n\n` +
               `[👉 Click here to wrap your ${amount} ${tokenSymbol} → ${amount} WCRO](${magicLink})\n\n` +
               `⚠️ **Important:**\n` +
               `- You need sufficient ${tokenSymbol} balance (${amount} ${tokenSymbol} + gas fees)\n` +
               `- The link opens in a new tab where you'll confirm in your wallet\n` +
               `- Once confirmed, your ${amount} native ${tokenSymbol} becomes ${amount} WCRO (ERC-20 compatible)`;
      }
      
      // If it returns transaction details directly
      if (wrapResponse.data.transactionHash || wrapResponse.data.txHash) {
        const txHash = wrapResponse.data.transactionHash || wrapResponse.data.txHash;
        return `📦 Token Wrap Transaction Submitted:\n` +
               `- Amount: ${amount} ${tokenSymbol}\n` +
               `- Transaction Hash: ${txHash}\n` +
               `- Status: Pending\n\n` +
               `✅ Your ${tokenSymbol} will be wrapped into WCRO once the transaction is confirmed.`;
      }
      
      // Generic response
      return `📦 Token Wrap Response:\n` +
             `- Amount: ${amount} ${tokenSymbol}\n` +
             `- Response: ${JSON.stringify(wrapResponse.data, null, 2)}`;
    }
    
    return `📦 Token Wrap Request Processed:\n` +
           `- Amount: ${amount} ${tokenSymbol}\n` +
           `- Response: ${JSON.stringify(wrapResponse, null, 2)}`;
    
  } catch (error: any) {
    console.error(`[Wrap] ❌ Error calling Token.wrap():`, error);
    
    // If SDK doesn't have wrap method, provide helpful error
    if (error.message && error.message.includes('wrap') && error.message.includes('not a function')) {
      return `⚠️ Token.wrap() method not available in SDK version.\n` +
             `📋 Wrap Request Details:\n` +
             `- Amount: ${amount} ${tokenSymbol}\n` +
             `- Action: Wrap native ${tokenSymbol} into wrapped ${tokenSymbol} (WCRO)\n\n` +
             `💡 To wrap tokens manually:\n` +
             `1. Connect to WCRO contract: 0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23 (Cronos Testnet)\n` +
             `2. Call deposit() function with ${amount} CRO as value\n` +
             `3. Transaction will wrap your CRO into WCRO`;
    }
    
    throw new Error(`Failed to wrap token: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Build transfer transaction using SDK's Token.transfer() to demonstrate magic links
 * 
 * This function will actually call Token.transfer() to show what the magic link looks like.
 * 
 * ⚠️ NOTE: SDK's Token.transfer() requires a private key or returns a magic link
 *    - Magic link: URL that user must visit to complete transfer
 *    - This breaks the seamless chat experience
 * 
 * For production, we'd build transactions with ethers (like swaps) instead.
 */
async function buildTransferTransactionViaSDK(query: string): Promise<string> {
  const sdk = initDeveloperPlatformSDK();
  if (!sdk) {
    throw new Error("Developer Platform SDK not available");
  }
  
  const { Token } = sdk;
  
  // Parse transfer request: "transfer 5 CRO to 0x..." or "send 100 USDC to 0x..."
  const amountMatch = query.match(/(?:transfer|send)\s+(\d+(?:\.\d+)?)\s+(\w+)/i);
  const addressMatch = query.match(/0x[a-fA-F0-9]{40}/g);
  
  if (!amountMatch || !addressMatch || addressMatch.length < 1) {
    throw new Error("Could not parse transfer request. Format: 'transfer X TOKEN to 0xAddress' or 'send X TOKEN to 0xAddress'");
  }
  
  const amount = parseFloat(amountMatch[1]);
  const tokenSymbol = amountMatch[2].toUpperCase();
  
  // Extract contract address first (if present) - look for "contract address:" or "contract:"
  const contractMatch = query.match(/contract[:\s]+(0x[a-fA-F0-9]{40})/i);
  const contractAddress = contractMatch ? contractMatch[1] : undefined;
  
  // Extract recipient address - should be the address that comes after "to" or "address"
  // If contract address is found, exclude it from the recipient search
  let toAddress: string | undefined;
  const toMatch = query.match(/(?:to|address)[:\s]+(0x[a-fA-F0-9]{40})/i);
  if (toMatch) {
    toAddress = toMatch[1];
  } else if (addressMatch.length === 1) {
    // Only one address found, use it as recipient
    toAddress = addressMatch[0];
  } else if (contractAddress && addressMatch.length === 2) {
    // Two addresses found, one is contract - use the other as recipient
    toAddress = addressMatch.find(addr => addr.toLowerCase() !== contractAddress.toLowerCase());
  } else {
    // Fallback: use first address as recipient (before contract address in text)
    const contractIndex = contractAddress ? query.indexOf(contractAddress) : -1;
    if (contractIndex > 0) {
      // Find address that appears before contract address
      toAddress = addressMatch.find(addr => query.indexOf(addr) < contractIndex);
    }
    // If still not found, use first address
    if (!toAddress) {
      toAddress = addressMatch[0];
    }
  }
  
  if (!toAddress) {
    throw new Error("Could not determine recipient address from transfer request");
  }
  
  // Check if it's a token transfer (ERC-20) or native transfer
  const isNativeToken = tokenSymbol === 'CRO' || tokenSymbol === 'TCRO' || tokenSymbol === 'NATIVE';
  
  console.log(`[Transfer] Attempting SDK Token.transfer() to demonstrate magic link:`, {
    amount,
    tokenSymbol,
    toAddress,
    isNativeToken,
  });
  
  try {
    let transferResponse;
    
    if (isNativeToken) {
      // Native CRO transfer
      console.log(`[Transfer] Calling Token.transfer() for native CRO...`);
      transferResponse = await Token.transfer({
        to: toAddress,
        amount: amount
      });
    } else {
      // ERC-20 token transfer - need contract address
      // For demo, we'll try without contract address first to see the error/magic link structure
      console.log(`[Transfer] Calling Token.transfer() for ERC-20 token (may need contract address)...`);
      
      if (contractAddress) {
        // Following SDK documentation in tokensdk.md: use raw human-readable amount as a number
        const transferAmount = Number(amount);

        console.log(`[Transfer] 💸 Calling Token.transfer() with params:`, { to: toAddress, amount: transferAmount, contractAddress });

        transferResponse = await Token.transfer({
          to: toAddress,
          amount: transferAmount,
          contractAddress: contractAddress
        });
      } else {
        // Return info about needing contract address, but also show what magic link structure looks like
        return `📋 Transfer Request Parsed:\n` +
               `- Type: ERC-20 token transfer\n` +
               `- Token: ${tokenSymbol}\n` +
               `- Amount: ${amount}\n` +
               `- To: ${toAddress}\n\n` +
               `⚠️ Missing: Token contract address is required for ERC-20 transfers.\n` +
               `Please provide the contract address: "transfer ${amount} ${tokenSymbol} to ${toAddress} contract: 0x..."\n\n` +
               `🔗 Magic Link Demo:\n` +
               `When SDK's Token.transfer() is called, it returns:\n` +
               `\`\`\`json\n` +
               `{\n` +
               `  "status": "Success",\n` +
               `  "data": {\n` +
               `    "magicLink": "https://provider/transfer-token/..."\n` +
               `  }\n` +
               `}\n` +
               `\`\`\`\n\n` +
               `The user must visit this magic link URL to complete the transfer.\n` +
               `This requires leaving the chat interface - not ideal for seamless UX!`;
      }
    }
    
    console.log(`[Transfer] ✅ SDK Token.transfer() response:`, JSON.stringify(transferResponse, null, 2));
    
    // Parse the response
    const responseData = transferResponse?.data || transferResponse;
    const magicLink = responseData?.magicLink || responseData?.magic_link || responseData?.link;
    const status = transferResponse?.status || responseData?.status || 'Unknown';
    
    if (magicLink) {
      return `🔗 Magic Link Generated by SDK's Token.transfer():\n\n` +
             `**Transfer Details:**\n` +
             `- Type: ${isNativeToken ? 'Native CRO' : `ERC-20 ${tokenSymbol}`}\n` +
             `- Amount: ${amount} ${tokenSymbol}\n` +
             `- To: ${toAddress}\n` +
             `- Status: ${status}\n\n` +
             `**Magic Link:**\n` +
             `${magicLink}\n\n` +
             `⚠️ **How Magic Links Work:**\n` +
             `1. SDK returns a URL (magic link)\n` +
             `2. User must click/visit this URL\n` +
             `3. User is redirected to an external page\n` +
             `4. User completes the transfer on that page\n` +
             `5. User returns to chat (if they remember!)\n\n` +
             `❌ **Problems with Magic Links:**\n` +
             `- User leaves the chat interface\n` +
             `- Not seamless - breaks the flow\n` +
             `- Requires external browser navigation\n` +
             `- Poor UX for agent-driven workflows\n\n` +
             `✅ **Better Approach (like swaps):**\n` +
             `- Build transaction with ethers.js\n` +
             `- Return transaction data to frontend\n` +
             `- User signs directly in wallet\n` +
             `- Execute transaction\n` +
             `- Everything stays in chat! 🎉`;
    } else {
      // Response doesn't have magic link - might be different structure
      return `📋 SDK Token.transfer() Response:\n\n` +
             `**Status:** ${status}\n` +
             `**Response Structure:**\n` +
             `\`\`\`json\n` +
             `${JSON.stringify(transferResponse, null, 2)}\n` +
             `\`\`\`\n\n` +
             `**Transfer Details:**\n` +
             `- Type: ${isNativeToken ? 'Native CRO' : `ERC-20 ${tokenSymbol}`}\n` +
             `- Amount: ${amount} ${tokenSymbol}\n` +
             `- To: ${toAddress}\n\n` +
             `Note: No magic link found in response. The SDK might use a different structure or require additional setup.`;
    }
  } catch (error: any) {
    console.error(`[Transfer] ❌ Error calling SDK Token.transfer():`, error);
    
    // Return informative error with magic link explanation
    return `❌ SDK Token.transfer() Error:\n\n` +
           `**Error:** ${error.message || String(error)}\n\n` +
           `**Transfer Request:**\n` +
           `- Type: ${isNativeToken ? 'Native CRO' : `ERC-20 ${tokenSymbol}`}\n` +
           `- Amount: ${amount} ${tokenSymbol}\n` +
           `- To: ${toAddress}\n\n` +
           `**About Magic Links:**\n` +
           `The SDK's Token.transfer() method typically returns a response like:\n` +
           `\`\`\`json\n` +
           `{\n` +
           `  "status": "Success",\n` +
           `  "data": {\n` +
           `    "magicLink": "https://provider/transfer-token/..."\n` +
           `  }\n` +
           `}\n` +
           `\`\`\`\n\n` +
           `**Why Magic Links Are Problematic:**\n` +
           `1. User must visit the magic link URL\n` +
           `2. This takes them outside the chat interface\n` +
           `3. Not seamless for agent-driven workflows\n` +
           `4. Better: Build transaction with ethers, sign in wallet (like swaps)`;
  }
}

/**
 * Execute Solana blockchain query
 */
export async function executeSolanaQuery(query: string): Promise<string> {
  const queryLower = query.toLowerCase();
  
  // Extract address (base58) from query
  const addressMatch = query.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
  if (!addressMatch && !queryLower.includes('latest')) {
    return "Could not find a valid Solana address in the query.";
  }
  
  const connection = new Connection(SOLANA_RPC_URL);
  
  if (queryLower.includes('balance')) {
    try {
      const address = addressMatch ? addressMatch[0] : null;
      if (!address) return "Please provide a Solana address to check balance.";
      
      const pubkey = new PublicKey(address);
      const balance = await connection.getBalance(pubkey);
      const solBalance = balance / LAMPORTS_PER_SOL;
      
      return `Solana Balance for ${address}: ${solBalance.toFixed(4)} SOL`;
    } catch (error: any) {
      return `Error fetching Solana balance: ${error.message}`;
    }
  }
  
  if (queryLower.includes('latest block') || queryLower.includes('slot')) {
    try {
      const slot = await connection.getSlot();
      return `Current Solana Slot: ${slot}\nNetwork: ${process.env.SOLANA_NETWORK || 'devnet'}`;
    } catch (error: any) {
      return `Error fetching Solana network info: ${error.message}`;
    }
  }
  
  return "Query type not recognized for Solana. Try 'balance' or 'latest block'.";
}

/**
 * Execute blockchain query using Crypto.com SDKs (Cronos) or Solana RPC
 */
export async function executeBlockchainQuery(
  client: any,
  query: string
): Promise<string> {
  const queryLower = query.toLowerCase();
  
  // Check if it's a Solana query
  if (queryLower.includes('solana') || queryLower.includes('sol ') || queryLower.includes('sol.')) {
    return await executeSolanaQuery(query);
  }
  
  // Exchange, Defi, and CronosID queries are handled by AI Agent SDK
  // AI Agent SDK internally uses Developer Platform SDK and provides better formatting
  // These queries will be processed by AI Agent SDK's built-in handlers
  // No need to route them directly - let AI Agent SDK handle them
  
  // Block queries - can use either AI Agent SDK or Developer Platform SDK Block module
  // Check if query is for specific block number (will fail with AI Agent SDK due to Explorer API limitation)
  const isSpecificBlockNumber = queryLower.includes('block') && query.match(/\b\d{6,}\b/); // Block with 6+ digit number (specific block)
  const isLatestBlock = queryLower.includes('latest block') || (queryLower.includes('block') && (queryLower.includes('latest') || queryLower.includes('current') || queryLower.includes('most recent')));
  
  // Try Developer Platform SDK Block module for block queries (supports detail parameter)
  if (queryLower.includes('block') && (queryLower.includes('latest') || queryLower.includes('pending') || queryLower.includes('earliest') || queryLower.includes('get') || queryLower.includes('detail'))) {
    console.log("[SDK] Block query detected - trying Developer Platform SDK (Block.getBlockByTag) first...");
    try {
      return await getBlockByTagViaSDK(query);
    } catch (blockError) {
      console.log("[SDK] Block module failed, will try AI Agent SDK or RPC fallback...");
      // Continue to AI Agent SDK or RPC fallback below
    }
  }
  
  // Check for Exchange, Defi, CronosID queries - these should use AI Agent SDK
  const isExchangeQuery = (queryLower.includes('get all tickers') || (queryLower.includes('all tickers') && queryLower.includes('get'))) ||
                          (queryLower.includes('ticker') && (queryLower.includes('information') || queryLower.includes('of') || queryLower.includes('for')));
  const isDefiQuery = (queryLower.includes('whitelisted tokens') && queryLower.includes('protocol')) ||
                      (queryLower.includes('all farms') && queryLower.includes('protocol')) ||
                      (queryLower.includes('farm') && queryLower.includes('protocol') && (queryLower.includes('symbol') || queryLower.includes('by')));
  const isCronosIdQuery = (queryLower.includes('resolve') && queryLower.includes('cronosid') && queryLower.includes('name')) ||
                          (queryLower.includes('lookup') && queryLower.includes('cronosid') && query.match(/0x[a-fA-F0-9]{40}/));
  
  const isSimpleQuery = 
    (queryLower.includes('balance') && !queryLower.includes('token') && !query.match(/0x[a-fA-F0-9]{40}.*0x[a-fA-F0-9]{40}/)) || // Simple balance, not token with contract
    (isLatestBlock && !queryLower.includes('detail')) || // Latest block without detail (works with AI Agent SDK)
    (queryLower.includes('transaction') && query.match(/0x[a-fA-F0-9]{64}/)) || // Transaction by hash
    isExchangeQuery || // Exchange queries (Get all tickers, ticker information)
    isDefiQuery || // Defi queries (whitelisted tokens, farms)
    isCronosIdQuery; // CronosID queries (resolve, lookup)
  
  // Count how many addresses are in the query (wallet + token contract = complex)
  const addressMatches = query.match(/0x[a-fA-F0-9]{40}/g);
  const addressCount = addressMatches ? addressMatches.length : 0;
  
  const isComplexQuery = 
    (queryLower.includes('token') && queryLower.includes('balance') && addressCount >= 1) || // Token balance (any address)
    (queryLower.includes('token') && addressCount >= 2) || // Token query with wallet + contract address
    (queryLower.includes('erc20') || queryLower.includes('erc-20')) ||
    (queryLower.includes('gas price') || queryLower.includes('fee data')) ||
    (queryLower.includes('create wallet') || queryLower.includes('new wallet')) ||
    (queryLower.includes('token contract address') || queryLower.includes('token contract is')); // Explicit token contract mentions
  
  // Skip AI Agent SDK for specific block numbers - Explorer API doesn't support getBlockByNumber for this API key tier
  // Go straight to RPC which works reliably
  if (isSpecificBlockNumber && !isLatestBlock) {
    console.log("[SDK] ⚠️ Specific block number query detected - Explorer API getBlockByNumber not available for this API key tier");
    console.log("[SDK]   Skipping AI Agent SDK, using RPC directly (more reliable)");
  } else if (isComplexQuery) {
    console.log("[SDK] ⚠️ Complex query detected - skipping AI Agent SDK, using Developer Platform SDK directly");
  } else if (isSimpleQuery && client && client.agent && typeof client.agent.generateQuery === 'function') {
    // Priority 1: Try AI Agent SDK for simple queries only
    try {
      console.log(`[SDK] Attempting blockchain query via AI Agent SDK: "${query.substring(0, 50)}..."`);
      console.log(`[SDK] Client type: ${typeof client}, has agent: ${!!client.agent}`);
      
      // For Exchange/Defi/CronosID queries, try generateQuery() first (AI Agent SDK handles these)
      // Note: The Node.js SDK uses generateQuery(), not interact() (interact() is for Python SDK)
      let response;
      if (isExchangeQuery || isDefiQuery || isCronosIdQuery) {
        const queryType = isExchangeQuery ? 'Exchange' : isDefiQuery ? 'Defi' : 'CronosID';
        console.log(`[SDK] Using agent.generateQuery() for ${queryType} query via AI Agent SDK...`);
        response = await client.agent.generateQuery(query);
      } else {
        response = await client.agent.generateQuery(query);
      }
      console.log(`[SDK] ✅ Query successful via AI Agent SDK, response type: ${typeof response}`);
      
      // Check if response indicates an error (403, Failed status, etc.)
      let responseText = "";
      if (response && typeof response === 'string') {
        responseText = response;
      } else if (response && response.text) {
        responseText = response.text;
      } else if (response && response.response) {
        responseText = response.response;
      } else if (response && response.data) {
        responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
      } else {
        responseText = JSON.stringify(response, null, 2);
      }
      
      // Check if the response contains errors (like 403 from Explorer API)
      // For Exchange/Defi/CronosID queries, if we get a 403, fall back to Developer Platform SDK
      if (response && typeof response === 'object') {
        const responseStr = JSON.stringify(response);
        const has403Error = responseStr.includes('403') || responseStr.includes('Forbidden') || 
            (response.hasErrors === true) || 
            (response.results && response.results.some((r: any) => r.status === 'Failed' && r.message?.includes('403')));
        
        if (has403Error) {
          console.log("[SDK] ⚠️ AI Agent SDK returned success but contains 403 error from Explorer API");
          console.log("[SDK]   This means Explorer API key may not have permission or is rate-limited");
          if (isExchangeQuery || isDefiQuery || isCronosIdQuery) {
            console.log("[SDK]   For Exchange/Defi/CronosID queries, falling back to Developer Platform SDK...");
            // Don't return the error response, let it fall through to fallback
            throw new Error("AI Agent SDK Explorer API returned 403 Forbidden - falling back to Developer Platform SDK");
          } else {
            console.log("[SDK]   Falling back to RPC/Developer Platform SDK...");
            throw new Error("AI Agent SDK Explorer API returned 403 Forbidden");
          }
        }
      }
      
      // Also check responseText for 403 errors (in case response is a string)
      if (responseText && (responseText.includes('403') || responseText.includes('Forbidden'))) {
        console.log("[SDK] ⚠️ AI Agent SDK response text contains 403 error");
        if (isExchangeQuery || isDefiQuery || isCronosIdQuery) {
          console.log("[SDK]   For Exchange/Defi/CronosID queries, falling back to Developer Platform SDK...");
          throw new Error("AI Agent SDK Explorer API returned 403 Forbidden - falling back to Developer Platform SDK");
        } else {
          throw new Error("AI Agent SDK Explorer API returned 403 Forbidden");
        }
      }
      
      return responseText;
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const statusCode = error?.status || error?.statusCode || error?.response?.status;
      
      // Log full error details for debugging
      console.error("[SDK] ❌ Error executing blockchain query via AI Agent SDK:", {
        message: errorMessage,
        statusCode: statusCode,
        error: error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Try to extract more details from error response
      if (error?.response) {
        console.error("[SDK] Error response details:", {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });
      }
      
      // Log specific error reasons
      if (statusCode === 400) {
        console.log("[SDK] ⚠️ 400 Bad Request - Possible causes:");
        console.log("[SDK]   1. API key not properly configured in blockchain_config.api_key");
        console.log("[SDK]   2. Query format not supported");
        console.log("[SDK]   3. Missing required parameters");
        console.log("[SDK]   4. Chain ID mismatch with explorer keys");
        console.log("[SDK]   Trying Developer Platform SDK instead...");
      } else if (statusCode === 401) {
        console.log("[SDK] ⚠️ 401 Unauthorized - API key authentication issue");
        console.log("[SDK]   Check: CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY is valid");
      } else if (statusCode === 429) {
        console.log("[SDK] ⚠️ 429 Rate Limited - Too many requests");
      } else if (statusCode === 403 || errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        console.log("[SDK] ⚠️ 403 Forbidden - Explorer API access denied");
        console.log("[SDK]   Possible causes:");
        console.log("[SDK]   1. Explorer API key doesn't have permission for this endpoint");
        console.log("[SDK]   2. Explorer API key is invalid or expired");
        console.log("[SDK]   3. Rate limiting or IP restrictions");
        console.log("[SDK]   For block queries, will try RPC fallback...");
      }
      
      // Continue to Developer Platform SDK or RPC
      console.log("[SDK] ⚠️ AI Agent SDK failed, trying fallback...");
    }
  } else {
    if (!client || !client.agent) {
      console.log("[SDK] No AI Agent client available, trying Developer Platform SDK...");
    } else {
      console.log("[SDK] Query not suitable for AI Agent SDK, using Developer Platform SDK...");
    }
  }

  // Priority 2: Try Developer Platform Client SDK (all available modules)
  try {
    // Balance queries
    if (queryLower.includes('balance') && !queryLower.includes('token')) {
      console.log("[SDK] Trying Developer Platform Client SDK (Wallet.balance)...");
      return await queryBlockchainDirectly(query);
    }
    
    // Transaction queries
    if (queryLower.includes('transaction') || queryLower.includes('tx')) {
      // Check if it's a transaction hash query
      if (query.match(/0x[a-fA-F0-9]{64}/)) {
        console.log("[SDK] Trying Developer Platform Client SDK (Transaction.getTransactionByHash)...");
        return await queryTransactionByHash(query);
      }
      // Otherwise, it's a transaction list query
      console.log("[SDK] Trying Developer Platform Client SDK (Transaction module)...");
      return await queryTransactionsViaSDK(query);
    }
    
    // Block queries (latest block, block by number) - use RPC directly for specific blocks, or as fallback
    if (queryLower.includes('block') || queryLower.includes('latest block')) {
      console.log("[SDK] Trying RPC for block query (getBlockNumber/getBlock)...");
      return await queryBlockInfoViaRPC(query);
    }
    
    // Gas price/fee queries
    if (queryLower.includes('gas') || queryLower.includes('fee')) {
      console.log("[SDK] Trying Developer Platform Client SDK (Transaction.getGasPrice/getFeeData)...");
      return await queryGasInfoViaSDK(query);
    }
    
    // Token balance queries
    if (queryLower.includes('token') && queryLower.includes('balance')) {
      console.log("[SDK] Trying Developer Platform Client SDK (Token.getERC20TokenBalance)...");
      return await queryTokenBalanceViaSDK(query);
    }
    
    // Token transfer queries (read-only - query past transfers)
    if (queryLower.includes('token') && (queryLower.includes('transfer') || queryLower.includes('transfer')) && 
        (queryLower.includes('history') || queryLower.includes('list') || queryLower.includes('get') || queryLower.includes('show'))) {
      console.log("[SDK] Trying Developer Platform Client SDK (Token.getTokenTransfers)...");
      return await queryTokenTransfersViaSDK(query);
    }
    
    // Transfer execution requests (build transaction, don't execute)
    if ((queryLower.includes('transfer') || queryLower.includes('send')) && 
        queryLower.includes('to') && 
        !queryLower.includes('history') && !queryLower.includes('list') && !queryLower.includes('get')) {
      console.log("[SDK] User requested transfer - building transaction details...");
      return await buildTransferTransactionViaSDK(query);
    }
    
    // Wallet creation queries
    if (queryLower.includes('create') && (queryLower.includes('wallet') || queryLower.includes('address'))) {
      console.log("[SDK] Trying Developer Platform Client SDK (Wallet.create)...");
      return await createWalletViaSDK();
    }
    
    // Token wrapping queries - use Developer Platform SDK directly (not supported by AI Agent SDK)
    if (queryLower.includes('wrap') && (queryLower.includes('cro') || queryLower.includes('token'))) {
      console.log("[SDK] Trying Developer Platform Client SDK (Token.wrap)...");
      return await wrapTokenViaSDK(query);
    }
    
    // Exchange queries - fallback to Developer Platform SDK when AI Agent SDK fails
    if (isExchangeQuery) {
      if (queryLower.includes('get all tickers') || (queryLower.includes('all tickers') && queryLower.includes('get'))) {
        console.log("[SDK] Trying Developer Platform Client SDK (Exchange.getAllTickers) as fallback...");
        return await getAllTickersViaSDK();
      } else if (queryLower.includes('ticker') && (queryLower.includes('information') || queryLower.includes('of') || queryLower.includes('for'))) {
        console.log("[SDK] Trying Developer Platform Client SDK (Exchange.getTickerByInstrument) as fallback...");
        return await getTickerByInstrumentViaSDK(query);
      }
    }
    
    // Defi queries - fallback to Developer Platform SDK when AI Agent SDK fails
    if (isDefiQuery) {
      if (queryLower.includes('whitelisted tokens') && queryLower.includes('protocol')) {
        console.log("[SDK] Trying Developer Platform Client SDK (Defi.getWhitelistedTokens) as fallback...");
        return await getWhitelistedTokensViaSDK(query);
      } else if (queryLower.includes('all farms') && queryLower.includes('protocol')) {
        console.log("[SDK] Trying Developer Platform Client SDK (Defi.getAllFarms) as fallback...");
        return await getAllFarmsViaSDK(query);
      } else if (queryLower.includes('farm') && queryLower.includes('protocol') && (queryLower.includes('symbol') || queryLower.includes('by'))) {
        console.log("[SDK] Trying Developer Platform Client SDK (Defi.getFarmBySymbol) as fallback...");
        return await getFarmBySymbolViaSDK(query);
      }
    }
    
    // CronosID queries - fallback to Developer Platform SDK when AI Agent SDK fails
    if (isCronosIdQuery) {
      if (queryLower.includes('resolve') && queryLower.includes('cronosid') && queryLower.includes('name')) {
        console.log("[SDK] Trying Developer Platform Client SDK (CronosID.resolve) as fallback...");
        return await resolveCronosIdNameViaSDK(query);
      } else if (queryLower.includes('lookup') && queryLower.includes('cronosid') && query.match(/0x[a-fA-F0-9]{40}/)) {
        console.log("[SDK] Trying Developer Platform Client SDK (CronosID.lookup) as fallback...");
        return await lookupCronosIdAddressViaSDK(query);
      }
    }
    
    // Block queries by tag - "Get latest block with detail"
    if (queryLower.includes('block') && (queryLower.includes('latest') || queryLower.includes('pending') || queryLower.includes('earliest') || queryLower.includes('get'))) {
      console.log("[SDK] Trying Developer Platform Client SDK (Block.getBlockByTag)...");
      return await getBlockByTagViaSDK(query);
    }
    
    // If query contains an address but we don't know what to do, try balance as default
    if (query.match(/0x[a-fA-F0-9]{40}/)) {
      console.log("[SDK] Address detected but query type unclear, trying balance query...");
      return await queryBlockchainDirectly(query);
    }
    
    // If no SDK can handle it, return error for AI to handle
    throw new Error("Query type not recognized. Please specify: balance, transaction, token balance, gas price, create wallet, etc.");
    
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SDK] ❌ Developer Platform SDK failed:", errorMessage);
    
    // Return error message - let Gemini/AI handle the response
    return `Unable to fetch blockchain data via SDK: ${errorMessage}. ` +
           `Please rephrase your query or specify what type of data you need (balance, transactions, token balance, etc.).`;
  }
}

/**
 * Build enhanced system prompt with tool instructions
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  tools: AgentTools,
  agentDescription: string
): string {
  let enhancedPrompt = basePrompt;

  if (tools.hasBlockchainAccess) {
    enhancedPrompt += `\n\n## Available Tools:
- **Blockchain Query**: You can query Cronos EVM blockchain data (balances, transactions, blocks, contracts)
- **Balance Check**: Check token balances for any address
- **Transaction Lookup**: Look up transaction details by hash
- **Contract Interaction**: Query smart contract state

When users ask about blockchain data, use these tools to fetch real on-chain information.
Example: "Check balance of 0x..." → Use blockchain_query tool
Example: "What's the latest block?" → Use blockchain_query tool
`;
  }

  if (tools.hasMarketDataAccess) {
    enhancedPrompt += `\n\n## Available Tools:
- **Market Data**: Access real-time cryptocurrency prices and market data
- **Price Lookup**: Get current prices for any cryptocurrency
- **Volume Analysis**: Get trading volume and market statistics

When users ask about prices or market data, use these tools to fetch real-time information.
Example: "What's the price of Bitcoin?" → Use market_data tool
Example: "Show me ETH volume" → Use market_data tool
`;
  }

  if (tools.hasSwapAccess) {
    const rpcUrl = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";
    const isTestnet = rpcUrl.includes("evm-t3") || rpcUrl.includes("testnet");
    const network = isTestnet ? "Cronos Testnet" : "Cronos Mainnet";
    
    enhancedPrompt += `\n\n## Available Tools:
- **VVS Swap**: Execute token swaps on VVS Finance DEX (${network})
- **Token Swap**: Swap tokens on Cronos using VVS Finance
- **Get Swap Quote**: Get swap quotes before executing

## Swap Instructions:
When users request token swaps:
1. Identify the tokens to swap (e.g., "swap 100 CRO for USDC")
2. Inform them about the network: ${network}
3. Explain that swaps require x402 payment ($0.15 per swap)
4. Guide them to use the swap interface or provide swap details
${isTestnet ? "5. Note: VVS Finance may use mock mode on testnet for demonstration\n" : "5. Note: Real swaps execute on VVS Finance Mainnet\n"}
6. You can help them get quotes and understand swap mechanics

Example: "I want to swap 100 CRO for USDC" → Explain the process, network, and guide them
`;
  }

  if (!tools.hasBlockchainAccess && !tools.hasMarketDataAccess && !tools.hasSwapAccess) {
    enhancedPrompt += `\n\n## Note:
This agent focuses on text analysis and generation. It does not have access to real-time blockchain or market data.
If users ask for live data, inform them that this agent specializes in: ${agentDescription}
`;
  }

  // Add focus enforcement
  enhancedPrompt += `\n\n## Focus Enforcement:
- You MUST stay focused on your specialization: ${agentDescription}
- If a question is NOT related to your specialization, politely decline and explain what you can help with
- DO NOT answer generic questions outside your domain
- DO NOT act as a general-purpose assistant
- STAY ON TOPIC: ${agentDescription}
`;

  return enhancedPrompt;
}
