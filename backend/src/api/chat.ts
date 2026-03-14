import { Router, Request, Response } from "express";
import { db } from "../lib/database";
import { determineAgentTools, fetchMarketData, createCryptoComClient, executeBlockchainQuery } from "../agent-engine/tools";
import { verifySolanaTransaction } from "../utils/solana";
import { executeAgent } from "../agent-engine/executor";
import { ethers } from "ethers";
import { getVVSQuote, getTokenAddress, buildVVSSwapTransaction, getTokenDecimals } from "../lib/vvs-finance";

/**
 * OPTIMIZATION: Simple in-memory cache for market data
 * Cache TTL: 30 seconds (market data changes frequently but not every second)
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

const marketDataCache = new Map<string, CacheEntry<any>>();
const MARKET_DATA_CACHE_TTL = 30 * 1000; // 30 seconds

function getCachedMarketData(symbol: string): any | null {
  const entry = marketDataCache.get(symbol);
  if (entry && Date.now() - entry.timestamp < entry.ttl) {
    console.log(`[Cache] ✅ Market data cache hit for ${symbol}`);
    return entry.data;
  }
  if (entry) {
    marketDataCache.delete(symbol); // Remove expired entry
  }
  return null;
}

function setCachedMarketData(symbol: string, data: any): void {
  marketDataCache.set(symbol, {
    data,
    timestamp: Date.now(),
    ttl: MARKET_DATA_CACHE_TTL,
  });
  console.log(`[Cache] 💾 Market data cached for ${symbol}`);
}

// Export cache functions for use in executor.ts
export { getCachedMarketData, setCachedMarketData };

/**
 * OPTIMIZATION: Parallel data fetching helper
 * Fetches all independent data sources in parallel for faster response times
 */
async function fetchDataInParallel(params: {
  needsMarketData: boolean;
  needsBlockchain: boolean;
  needsSwap: boolean;
  needsTransfer: boolean;
  needsPortfolio: boolean;
  needsHistory: boolean;
  input: string;
  inputLower: string;
  verification: any;
}): Promise<{
  marketData: any;
  blockchainData: string | null;
  swapData: { swapTransactionData: any; swapQuoteInfo: any } | null;
  transferData: any;
  portfolioData: any;
  transactionHistory: any;
  realDataContext: string;
}> {
  const {
    needsMarketData,
    needsBlockchain,
    needsSwap,
    needsTransfer,
    needsPortfolio,
    needsHistory,
    input,
    inputLower,
    verification,
  } = params;

  const results = {
    marketData: null as any,
    blockchainData: null as string | null,
    swapData: null as { swapTransactionData: any; swapQuoteInfo: any } | null,
    transferData: null as any,
    portfolioData: null as any,
    transactionHistory: null as any,
    realDataContext: "",
  };

  const promises: Array<Promise<void | null>> = [];

  // 1. Market data fetch (parallel)
  if (needsMarketData) {
    let symbol: string | null = null;
    const priceOfPattern = /(?:price|cost)\s+of\s+([a-z]+)(?:\s+coin)?/i;
    const priceOfMatch = input.match(priceOfPattern);
    if (priceOfMatch) {
      symbol = priceOfMatch[1];
    } else {
      const pricePattern = /(?:current\s+)?([a-z]{2,10})\s+price/i;
      const priceMatch = input.match(pricePattern);
      if (priceMatch) {
        symbol = priceMatch[1];
      } else {
        const directSymbolPattern = /\b(bitcoin|btc|ethereum|eth|solana|sol|cardano|ada|polygon|matic|doge|dogecoin|shiba|shib)\b/i;
        const directMatch = input.match(directSymbolPattern);
        if (directMatch) {
          symbol = directMatch[1];
        }
      }
    }

    if (symbol) {
      const symbolMap: Record<string, string> = {
        bitcoin: "BTC", btc: "BTC", ethereum: "ETH", eth: "ETH",
        solana: "SOL", sol: "SOL", cardano: "ADA", ada: "ADA",
        polygon: "MATIC", matic: "MATIC", doge: "DOGE", dogecoin: "DOGE",
        shiba: "SHIB", shib: "SHIB",
      };
      const normalizedSymbol = symbolMap[symbol.toLowerCase()] || symbol.toUpperCase();
      
      // Check cache first
      const cachedData = getCachedMarketData(normalizedSymbol);
      if (cachedData) {
        results.marketData = { symbol: normalizedSymbol, data: cachedData };
      } else {
        // Fetch and cache
        promises.push(
          fetchMarketData(normalizedSymbol)
            .then((data) => {
              if (data && !data.error) {
                setCachedMarketData(normalizedSymbol, data);
                results.marketData = { symbol: normalizedSymbol, data };
              }
            })
            .catch((err) => console.warn(`[Chat] Market data fetch failed:`, err))
        );
      }
    }
  }

  // 2. Blockchain data fetch (parallel) - simplified for parallel execution
  if (needsBlockchain) {
    promises.push(
      (async () => {
        try {
          const blockchainClient = createCryptoComClient();
          if (blockchainClient && process.env.OPENAI_API_KEY) {
            const blockchainQuery = input.toLowerCase().includes("balance") && 
              !input.toLowerCase().includes("0x") && verification.payerAddress
              ? `${input} for address ${verification.payerAddress}`
              : input;
            
            const blockchainResult = await executeBlockchainQuery(blockchainClient, blockchainQuery);
            if (blockchainResult && !blockchainResult.includes("not available") && 
                !blockchainResult.includes("Error:") && !blockchainResult.includes("403")) {
              results.blockchainData = blockchainResult;
            }
          }
        } catch (err) {
          console.warn(`[Chat] Blockchain data fetch failed:`, err);
        }
      })()
    );
  }

  // 3. Swap quote fetch (parallel)
  if (needsSwap) {
    promises.push(
      (async () => {
        try {
          const swapMatch = input.match(/(?:swap|exchange|trade|convert)\s+(\d+(?:\.\d+)?)\s+(\w+)\s+(?:for|to|into)\s+(\w+)/i);
          if (swapMatch) {
            const amountIn = swapMatch[1];
            const tokenInSymbol = swapMatch[2].toUpperCase();
            const tokenOutSymbol = swapMatch[3].toUpperCase();
            
            const rpcUrl = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";
            const isTestnet = rpcUrl.includes("evm-t3") || rpcUrl.includes("testnet");
            const wantsMainnet = /mainnet|main|production/i.test(input);
            const networkForLookup = wantsMainnet || !isTestnet ? 'mainnet' : 'testnet';
            
            const tokenInAddress = await getTokenAddress(tokenInSymbol, networkForLookup) || tokenInSymbol;
            const tokenOutAddress = await getTokenAddress(tokenOutSymbol, networkForLookup) || tokenOutSymbol;
            const amountInWei = ethers.parseUnits(amountIn, 18);
            
            const quote = await getVVSQuote(tokenInAddress, tokenOutAddress, amountInWei.toString(), wantsMainnet);
            if (quote) {
              const tokenOutDecimals = getTokenDecimals(tokenOutAddress);
              const amountOut = ethers.formatUnits(quote.amountOut, tokenOutDecimals);
              const amountOutMin = (BigInt(quote.amountOut) * 99n / 100n).toString();
              
              results.swapData = {
                swapTransactionData: buildVVSSwapTransaction(
                  tokenInAddress,
                  tokenOutAddress,
                  amountInWei.toString(),
                  amountOutMin,
                  verification.payer || "0x0000000000000000000000000000000000000000"
                ),
                swapQuoteInfo: {
                  amountIn,
                  tokenIn: tokenInSymbol,
                  tokenOut: tokenOutSymbol,
                  expectedAmountOut: amountOut,
                  network: wantsMainnet || !isTestnet ? "Mainnet" : "Testnet",
                },
              };
            }
          }
        } catch (err) {
          console.warn(`[Chat] Swap quote fetch failed:`, err);
        }
      })()
    );
  }

  // 4. Portfolio fetch (parallel)
  if (needsPortfolio && verification.payer) {
    promises.push(
      (async () => {
        try {
          const { initDeveloperPlatformSDK } = require("../agent-engine/tools");
          const sdk = initDeveloperPlatformSDK();
          if (sdk && sdk.Wallet && sdk.Token) {
            const balances: Array<{ symbol: string; balance: string; contractAddress?: string }> = [];
            
            const nativeBalance = await sdk.Wallet.balance(verification.payer);
            if (nativeBalance?.data?.balance) {
              balances.push({ symbol: 'CRO', balance: nativeBalance.data.balance });
            }
            
            const commonTokens = [
              { address: '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0', symbol: 'USDC' },
              { address: '0x2D03bECE6747ADC00E1A131bBA1469C15FD11E03', symbol: 'VVS' },
            ];
            
            for (const token of commonTokens) {
              try {
                const tokenBalance = await sdk.Token.getERC20TokenBalance(verification.payer, token.address);
                
                // Check if the SDK call was successful
                if (!tokenBalance || tokenBalance.status === 'Error' || tokenBalance.error) {
                  console.warn(`[Chat] SDK returned error for ${token.symbol}:`, tokenBalance?.error || tokenBalance?.message);
                  continue; // Skip this token if SDK call failed
                }
                
                // Check if balance exists and is valid
                const balanceValue = tokenBalance?.data?.balance || tokenBalance?.balance;
                if (!balanceValue || parseFloat(String(balanceValue)) <= 0) {
                  console.log(`[Chat] No balance found for ${token.symbol} or balance is 0`);
                  continue; // Skip tokens with zero balance
                }
                
                if (balanceValue && parseFloat(String(balanceValue)) > 0) {
                  // Get token decimals for proper formatting using SDK metadata
                  let formattedBalance = String(balanceValue);
                  let decimals = 18; // Default to 18 if not found
                  
                  try {
                    const tokenMetadata = await sdk.Token.getERC20Metadata(token.address);
                    // Check if metadata call was successful and has decimals
                    if (tokenMetadata?.status === 'Success' && tokenMetadata?.data?.decimals !== undefined) {
                      // Decimals might be a string or number, convert to number
                      const metadataDecimals = parseInt(String(tokenMetadata.data.decimals), 10);
                      if (!isNaN(metadataDecimals) && metadataDecimals > 0) {
                        decimals = metadataDecimals;
                        console.log(`[Chat] ✅ Fetched decimals for ${token.symbol} from SDK: ${decimals}`);
                      } else {
                        console.warn(`[Chat] Invalid decimals value from SDK for ${token.symbol}: ${tokenMetadata.data.decimals}`);
                      }
                    } else {
                      console.warn(`[Chat] Metadata fetch failed or missing decimals for ${token.symbol}, status: ${tokenMetadata?.status}`);
                    }
                  } catch (e: any) {
                    // If metadata fetch fails, use known decimals for common tokens as fallback
                    console.warn(`[Chat] Error fetching metadata for ${token.symbol}:`, e?.message || e);
                    if (token.symbol === 'USDC' || token.symbol === 'USDT') {
                      decimals = 6; // USDC and USDT use 6 decimals
                      console.log(`[Chat] Using known decimals (6) for ${token.symbol} as fallback`);
                    } else if (token.symbol === 'VVS') {
                      decimals = 18; // VVS uses 18 decimals
                      console.log(`[Chat] Using known decimals (18) for ${token.symbol} as fallback`);
                    } else {
                      console.warn(`[Chat] Could not fetch decimals for ${token.symbol}, using default (18)`);
                    }
                  }
                  
                  // Convert raw balance to human-readable format
                  // Use manual calculation (more reliable than ethers.formatUnits with custom decimals)
                  try {
                    const balanceStr = String(balanceValue);
                    if (!balanceStr || balanceStr === '0') {
                      console.warn(`[Chat] Invalid balance value for ${token.symbol}: ${balanceStr}`);
                      continue; // Skip this token
                    }
                    
                    // Manual conversion: divide by 10^decimals
                    const balanceNum = parseFloat(balanceStr);
                    if (!isNaN(balanceNum) && balanceNum > 0) {
                      formattedBalance = (balanceNum / Math.pow(10, decimals)).toString();
                      // Remove trailing zeros (e.g., "4.610000" -> "4.61")
                      if (formattedBalance.includes('.')) {
                        formattedBalance = formattedBalance.replace(/\.?0+$/, '');
                      }
                      console.log(`[Chat] ✅ Formatted ${token.symbol} balance: ${balanceStr} → ${formattedBalance} (decimals: ${decimals})`);
                    } else {
                      console.warn(`[Chat] Invalid balance number for ${token.symbol}: ${balanceStr}`);
                      continue; // Skip this token
                    }
                  } catch (formatError: any) {
                    console.warn(`[Chat] Could not format balance for ${token.symbol}:`, formatError?.message || formatError);
                    console.warn(`[Chat] Balance value was:`, balanceValue);
                    // Keep raw balance if formatting fails
                  }
                  
                  balances.push({
                    symbol: token.symbol,
                    balance: formattedBalance,
                    contractAddress: token.address,
                  });
                }
              } catch (e) {
                // Skip failed tokens
                console.warn(`[Chat] Failed to fetch balance for ${token.symbol}:`, e);
              }
            }
            
            if (balances.length > 0) {
              results.portfolioData = {
                address: verification.payer,
                balances,
              };
            }
          }
        } catch (err) {
          console.warn(`[Chat] Portfolio fetch failed:`, err);
        }
      })()
    );
  }

  // 5. Transaction history fetch (parallel) - OPTIMIZED: Faster with timeout and reduced blocks
  // OPTIMIZATION: Use payer's address automatically when user says "my transaction history"
  if (needsHistory && verification.payer) {
    promises.push(
      (async () => {
        try {
          console.log(`[Chat] 📜 Fetching transaction history for ${verification.payer}...`);
          // OPTIMIZATION: Add 3 second timeout (reduced from 5s) to prevent blocking
          const timeoutPromise = new Promise<void>((resolve) => 
            setTimeout(() => {
              console.log(`[Chat] ⚠️ Transaction history fetch timed out after 3s`);
              resolve();
            }, 3000)
          );
          
          const fetchPromise = (async () => {
            const rpcUrl = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const currentBlock = await provider.getBlockNumber();
            const txList: any[] = [];
            // OPTIMIZATION: Reduce blocks to scan from 10 to 5 for much faster response
            const blocksToCheck = Math.min(5, currentBlock);
            const addressLower = verification.payer.toLowerCase();
            
            // OPTIMIZATION: Fetch only the most recent 5 blocks in parallel
            const blockPromises = [];
            for (let i = 0; i < blocksToCheck; i++) {
              blockPromises.push(
                provider.getBlock(currentBlock - i, true).catch(() => null)
              );
            }
            
            const blocks = await Promise.all(blockPromises);
            
            // OPTIMIZATION: Process blocks and transactions in parallel, limit to first 3 transactions per block
            const allTxPromises: Promise<any>[] = [];
            for (const block of blocks) {
              if (!block || txList.length >= 10) break;
              
              if (block.transactions && Array.isArray(block.transactions)) {
                // Only check first 3 transactions per block for speed
                for (const txHash of block.transactions.slice(0, 3)) {
                  if (txList.length >= 10) break;
                  allTxPromises.push(
                    provider.getTransaction(txHash).then(tx => {
                      if (tx?.hash && (tx.from?.toLowerCase() === addressLower || tx.to?.toLowerCase() === addressLower)) {
                        return {
                          hash: tx.hash,
                          from: tx.from || 'N/A',
                          to: tx.to || 'N/A',
                          value: tx.value ? ethers.formatEther(tx.value) + ' CRO' : '0 CRO',
                          timestamp: block.timestamp ? Number(block.timestamp) * 1000 : Date.now(),
                          blockNumber: Number(block.number),
                        };
                      }
                      return null;
                    }).catch(() => null)
                  );
                }
              }
            }
            
            const txResults = await Promise.all(allTxPromises);
            txList.push(...txResults.filter(tx => tx !== null && tx !== undefined));
            
            if (txList.length > 0) {
              txList.sort((a, b) => b.blockNumber - a.blockNumber);
              results.transactionHistory = {
                address: verification.payer,
                transactions: txList.slice(0, 10), // Limit to 10 transactions
              };
              console.log(`[Chat] ✅ Transaction history fetched: ${txList.length} transactions`);
            } else {
              console.log(`[Chat] ℹ️ No transactions found in last ${blocksToCheck} blocks`);
            }
          })();
          
          await Promise.race([fetchPromise, timeoutPromise]);
        } catch (err) {
          console.warn(`[Chat] Transaction history fetch failed:`, err);
        }
      })()
    );
  }

  // Wait for all parallel fetches to complete
  await Promise.allSettled(promises);

  // Build context string from results
  if (results.marketData) {
    results.realDataContext += `\n\n[Real Market Data for ${results.marketData.symbol}]:\n${JSON.stringify(results.marketData.data, null, 2)}\n`;
  }
  if (results.blockchainData) {
    results.realDataContext += `\n\n[Real Blockchain Data]:\n${results.blockchainData}\n`;
  }
  if (results.swapData) {
    results.realDataContext += `\n\n[Swap Quote]: ${results.swapData.swapQuoteInfo.amountIn} ${results.swapData.swapQuoteInfo.tokenIn} → ${results.swapData.swapQuoteInfo.expectedAmountOut} ${results.swapData.swapQuoteInfo.tokenOut} (${results.swapData.swapQuoteInfo.network})\n`;
  }
  if (results.portfolioData) {
    results.realDataContext += `\n\n[Portfolio Data]:\nUser wallet: ${results.portfolioData.address}\nToken balances:\n${results.portfolioData.balances.map((b: any) => `- ${b.symbol}: ${b.balance}`).join('\n')}\n`;
  }
  if (results.transactionHistory) {
    results.realDataContext += `\n\n[Transaction History]:\nUser wallet: ${results.transactionHistory.address}\nRecent transactions: ${results.transactionHistory.transactions.length}\n`;
  }

  return results;
}

const router = Router();

/**
 * Unified chat endpoint - automatically routes to right tools
 * POST /api/chat
 */
import { validateAgentInputMiddleware } from "../middleware/validation";
import { chatRateLimit } from "../middleware/rateLimit";

router.post("/", chatRateLimit, validateAgentInputMiddleware, async (req: Request, res: Response) => {
  try {
    const { input, paymentHash } = req.body;

    console.log(`\n[Chat] ========================================`);
    console.log(`[Chat] 📨 New chat request received`);
    console.log(`[Chat] Input: "${input.substring(0, 100)}${input.length > 100 ? '...' : ''}"`);
    console.log(`[Chat] ========================================\n`);

    if (!input) {
      return res.status(400).json({ error: "Input required" });
    }

    // For unified chat: Use fixed price 0.01 SOL for demo
    const agentPrice = 0.01;
    const registryWallet = process.env.SOLANA_REGISTRY_WALLET || "4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9";

    // Check for payment
    const solanaSignature = req.headers["x-solana-signature"] as string || req.body.paymentHash;

    if (!solanaSignature) {
      return res.status(402).json({
        error: "Payment required",
        message: "Please provide a Solana transaction signature for 0.01 SOL",
        priceUsd: 0.10, // For UI display
        priceSol: 0.01,
        payTo: registryWallet
      });
    }

    // Verify Solana payment
    console.log(`[Chat] Verifying Solana payment: ${solanaSignature}`);
    
    const verification = await verifySolanaTransaction(solanaSignature, 0.01 * 10**9);


    if (!verification.valid) {
      return res.status(402).json({
        error: "Payment verification failed",
        details: verification.error,
        paymentRequired: true,
      });
    }

    // Check if payment hash has already been used
    const existingExecution = db.getExecutions({ paymentHash: solanaSignature });
    
    if (existingExecution && existingExecution.length > 0) {
      console.warn(`[Chat] ⚠️ Signature ${solanaSignature} already used`);
      return res.status(402).json({
        error: "Payment already used",
        paymentRequired: true,
      });
    }

    // Analyze user input to determine what tools/capabilities are needed
    const inputLower = input.toLowerCase();
    
    // Detect intent
    const needsMarketData = /(?:price|price of|current price|what's the price|how much is|trading at|market|volume|bitcoin|btc|ethereum|eth|crypto)/i.test(input);
    const needsBlockchain = /(?:balance|transaction|block|address|contract|on-chain|blockchain|wallet|wrap|wrapping|ticker|tickers|exchange|defi|farm|protocol|cronosid|0x[a-fA-F0-9]{40})/i.test(input);
    // Detect swap requests: "swap 1 CRO for USDC", "exchange 100 CRO to USDC", etc.
    const needsSwap = /(?:swap|exchange|trade|convert|vvs|dex)\s+\d+.*?(?:for|to|into)/i.test(input);
    // Detect transfer requests: "transfer 5 CRO to 0x...", "send 100 USDC to 0x...", "send 10 CRO 0x..." (without "to")
    const needsTransfer = /(?:transfer|send)\s+\d+(?:\.\d+)?\s+(?:\w+\s+)*(?:to\s+)?0x[a-fA-F0-9]{40}/i.test(input);
    // Detect portfolio queries: "portfolio", "my tokens", "my balances", "show my wallet"
    const needsPortfolio = /(?:portfolio|my tokens|my balances|show my wallet|wallet balance|all my tokens|token holdings)/i.test(input);
    // Detect individual token balance queries: "my usdc balance", "what is my token balance", "balance of 0x...", etc.
    // This should catch ANY token balance query, not just specific tokens
    const hasTokenBalanceKeywords = /(?:my balance|my.*balance|balance.*in|balance.*of|what.*balance|show.*balance|check.*balance)/i.test(input);
    const hasContractAddress = input.match(/0x[a-fA-F0-9]{40}/);
    // Match if: has balance keywords AND (has contract address OR mentions token/usdc/usdt/cro/vvs OR has "contract" keyword)
    const mentionsToken = /(?:token|usdc|usdt|cro|vvs|erc20|erc-20|contract)/i.test(input);
    const needsTokenBalance = hasTokenBalanceKeywords && (hasContractAddress || mentionsToken) && verification.payer;
    // Detect transaction history queries: "my transactions", "transaction history", "recent transactions"
    // Also detect when user says "show my transaction history" or similar
    const needsHistory = /(?:my transactions|transaction history|recent transactions|tx history|last transactions|show my tx|show.*transaction)/i.test(input);
    
    if (needsSwap) {
      console.log(`[Chat] 💱 Swap request detected in input: "${input}"`);
    }
    if (needsTransfer) {
      console.log(`[Chat] 💸 Transfer request detected in input: "${input}"`);
    }
    const needsContractAnalysis = /(?:contract|solidity|pragma|function|analyze|audit|vulnerability|security|bug)/i.test(input);
    const needsContent = /(?:create|generate|write|tweet|post|content|marketing|copy)/i.test(input);

    // Build enhanced input with real data
    let enhancedInput = input;
    let realDataContext = "";

    // OPTIMIZATION: Fetch independent data in parallel for faster response
    // Note: Blockchain queries with complex fallbacks are handled separately below
    const parallelDataResults = await fetchDataInParallel({
      needsMarketData,
      needsBlockchain: false, // Handle blockchain separately due to complex fallback logic
      needsSwap,
      needsTransfer: false, // Transfer needs special handling
      needsPortfolio,
      needsHistory,
      input,
      inputLower: input.toLowerCase(),
      verification,
    });

    // Merge parallel results into context
    realDataContext += parallelDataResults.realDataContext;
    
    // Extract results for later use
    const swapTransactionData = parallelDataResults.swapData?.swapTransactionData || null;
    const swapQuoteInfo = parallelDataResults.swapData?.swapQuoteInfo || null;
    const portfolioData = parallelDataResults.portfolioData || null;
    const transactionHistory = parallelDataResults.transactionHistory || null;
    let transferMagicLink: { url: string; amount: string; token: string; to: string; type: string } | null = null;

    // Add swap context information (if swap was detected, even if quote fetch failed)
    if (needsSwap) {
      const rpcUrl = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";
      const isTestnet = rpcUrl.includes("evm-t3") || rpcUrl.includes("testnet");
      const network = isTestnet ? "Testnet" : "Mainnet";
      const isMainnet = !isTestnet;
      const vvsRouter = isMainnet
        ? (process.env.VVS_ROUTER_ADDRESS || "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae")
        : (process.env.VVS_ROUTER_ADDRESS_TESTNET || "Not deployed on testnet - use mock mode");
      
      // Add swap information context (if not already added by parallel fetch)
      if (!realDataContext.includes("[VVS Finance Swap Information]")) {
        realDataContext += `\n\n[VVS Finance Swap Information]:\n`;
        realDataContext += `Backend Network Configuration: Cronos ${network}\n`;
        realDataContext += `VVS Router Address: ${vvsRouter}\n`;
        realDataContext += `Swap Execution Cost: $0.15 (via x402 payment)\n`;
        realDataContext += `Supported Tokens: CRO, USDC, VVS, and any token address on Cronos (users can provide contract addresses)\n`;
        
        if (isMainnet) {
          realDataContext += `\n⚠️ IMPORTANT: VVS Finance swaps are on Cronos MAINNET.\n`;
          realDataContext += `- Backend is configured for mainnet\n`;
          realDataContext += `- User MUST switch their wallet to Cronos Mainnet (Chain ID: 25) to execute swaps\n`;
        } else {
          realDataContext += `\n⚠️ NOTE: Backend is on testnet, but VVS Finance is primarily on mainnet.\n`;
        }
      }
      
      // If we got a swap quote from parallel fetch, add detailed context
      if (swapQuoteInfo) {
        const wantsMainnet = /mainnet|main|production/i.test(input);
        const useMainnetForQuote = wantsMainnet || isMainnet;
        
        if (useMainnetForQuote) {
          realDataContext += `\n⚠️ IMPORTANT: This quote is from Cronos MAINNET VVS Finance.\n`;
          realDataContext += `- User MUST switch their wallet to Cronos Mainnet (Chain ID: 25) to execute this swap\n`;
          if (wantsMainnet && isTestnet) {
            realDataContext += `- Note: You requested a mainnet quote even though backend is on testnet. Quote fetched from mainnet.\n`;
          }
        } else {
          realDataContext += `\n⚠️ NOTE: This quote is from testnet (may use mock mode).\n`;
          realDataContext += `- For real swaps with actual liquidity, request a mainnet quote\n`;
        }
        realDataContext += `\nSwap parameters ready: tokenIn=${swapQuoteInfo.tokenIn}, tokenOut=${swapQuoteInfo.tokenOut}, amountIn=${swapQuoteInfo.amountIn}\n`;
      }
    }

    // Handle individual token balance queries first (before general blockchain queries)
    // This handles ANY ERC20 token, not just known ones
    if (needsTokenBalance && !needsPortfolio) {
      console.log(`[Chat] 💰 Individual token balance query detected: "${input}"`);
      try {
        const { queryTokenBalanceViaSDK } = require("../agent-engine/tools");
        
        // Extract contract address from query - look for explicit "contract" keyword first
        let contractAddress: string | null = null;
        const contractMatch = input.match(/contract[:\s]+(0x[a-fA-F0-9]{40})/i);
        if (contractMatch) {
          contractAddress = contractMatch[1];
        } else {
          // If no explicit "contract" keyword, check if there are multiple addresses
          // The last address is usually the token contract when user provides both wallet and contract
          const allAddresses = input.match(/0x[a-fA-F0-9]{40}/g);
          if (allAddresses && allAddresses.length > 1) {
            contractAddress = allAddresses[allAddresses.length - 1]; // Last address is likely the contract
          } else if (allAddresses && allAddresses.length === 1) {
            // Single address - could be wallet or contract, but if it's not the payer's address, assume it's a contract
            if (verification && verification.payer && allAddresses[0].toLowerCase() !== verification.payer.toLowerCase()) {
              contractAddress = allAddresses[0];
            }
          }
        }
        
        // Known token contracts on Cronos Testnet (for convenience)
        const knownTokens: { [key: string]: string } = {
          'usdc': '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0',
          'usdt': '0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0', // Same as USDC on testnet
        };
        
        // Extract token name if mentioned
        const tokenNameMatch = input.match(/\b(usdc|usdt|cro|vvs)\b/i);
        const tokenName = tokenNameMatch ? tokenNameMatch[0].toLowerCase() : null;
        
        // Build query with payer's address and token info
        // Format: "query address WALLET contract CONTRACT" (SDK expects wallet first, then contract)
        let balanceQuery = input;
        
        // If contract address is explicitly provided, use it
        if (contractAddress) {
          if (verification && verification.payer && !balanceQuery.includes(verification.payer)) {
            balanceQuery = `${input} address ${verification.payer} contract ${contractAddress}`;
          } else if (!balanceQuery.includes(contractAddress)) {
            // Wallet address already in query, just add contract
            balanceQuery = `${input} contract ${contractAddress}`;
          }
          console.log(`[Chat] ℹ️ Using provided contract address: ${contractAddress}`);
        } 
        // If no contract address but token name is mentioned, use known contract
        else if (!contractAddress && tokenName && knownTokens[tokenName] && verification && verification.payer && !balanceQuery.includes(verification.payer)) {
          balanceQuery = `${input} address ${verification.payer} contract ${knownTokens[tokenName]}`;
          console.log(`[Chat] ℹ️ Using known contract for ${tokenName.toUpperCase()}: ${knownTokens[tokenName]}`);
        }
        // If no contract address provided, add wallet address (SDK will return native balance or ask for contract)
        else if (verification && verification.payer && !balanceQuery.includes(verification.payer)) {
          balanceQuery = `${input} address ${verification.payer}`;
        }
        
        console.log(`[Chat] 🔍 Querying token balance with: "${balanceQuery}"`);
        const tokenBalanceResult = await queryTokenBalanceViaSDK(balanceQuery);
        if (tokenBalanceResult && !tokenBalanceResult.includes("Error:")) {
          realDataContext += `\n\n[Real Token Balance Data - Fetched via Crypto.com Developer Platform SDK]:\n${tokenBalanceResult}\n`;
          console.log(`[Chat] ✅ Token balance fetched successfully via Developer Platform SDK`);
        } else {
          console.warn(`[Chat] ⚠️ Token balance query failed: ${tokenBalanceResult}`);
          // If query failed and no contract was provided, suggest user provide contract address
          if (!contractAddress && !tokenName) {
            realDataContext += `\n\nNote: To check a specific ERC20 token balance, please provide the token's contract address. For example: "what is my balance for contract 0x..."`;
          }
        }
      } catch (error) {
        console.warn(`[Chat] ⚠️ Token balance query failed:`, error);
      }
    }

    // Fetch blockchain data if needed (but skip if we already handled token balance query)
    if (needsBlockchain && !needsTokenBalance) {
      // Exchange, Defi, and CronosID queries are handled by AI Agent SDK
      // AI Agent SDK internally uses Developer Platform SDK and provides better formatting
      // Token wrap queries still use Developer Platform SDK directly (not supported by AI Agent SDK)
      const inputLower = input.toLowerCase();
      let directSDKResult: string | null = null;
      
      // Token wrap queries - must use Developer Platform SDK (not supported by AI Agent SDK)
      if (inputLower.includes('wrap') && (inputLower.includes('cro') || inputLower.includes('token'))) {
        console.log(`[Chat] 📦 Token wrap query detected - routing directly to Developer Platform SDK...`);
        try {
          const { wrapTokenViaSDK } = require("../agent-engine/tools");
          directSDKResult = await wrapTokenViaSDK(input);
        } catch (error) {
          console.warn(`[Chat] ⚠️ Token wrap query failed:`, error);
        }
      }
      
      // If we got a direct SDK result (wrap), use it
      if (directSDKResult) {
        realDataContext += `\n\n[Real Data - Fetched via Crypto.com Developer Platform SDK]:\n${directSDKResult}\n`;
        console.log(`[Chat] ✅ Data fetched successfully via Developer Platform SDK`);
      } else {
        // Exchange, Defi, and CronosID queries go through AI Agent SDK (if OPENAI_API_KEY is set)
        // If AI Agent SDK not available, fall back to Developer Platform SDK directly
        // AI Agent SDK handles: "Get all tickers", "Get whitelisted tokens", "Get all farms", "Resolve CronosId", etc.
        // AI Agent SDK internally uses Developer Platform SDK and provides formatted responses
        
        // Check if AI Agent SDK is available (requires OPENAI_API_KEY)
        const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
        const inputLower = input.toLowerCase();
        const isExchangeQuery = (inputLower.includes('get all tickers') || (inputLower.includes('all tickers') && inputLower.includes('get'))) ||
                                (inputLower.includes('ticker') && (inputLower.includes('information') || inputLower.includes('of') || inputLower.includes('for')));
        const isDefiQuery = (inputLower.includes('whitelisted tokens') && inputLower.includes('protocol')) ||
                            (inputLower.includes('all farms') && inputLower.includes('protocol')) ||
                            (inputLower.includes('farm') && inputLower.includes('protocol') && inputLower.includes('symbol'));
        const isCronosIdQuery = (inputLower.includes('resolve') && inputLower.includes('cronosid') && inputLower.includes('name')) ||
                                (inputLower.includes('lookup') && inputLower.includes('cronosid') && input.match(/0x[a-fA-F0-9]{40}/));
        
        let directSDKResult: string | null = null;
        
        // OPTIMIZATION: For exchange queries (get all tickers), skip AI Agent SDK and go directly to Developer Platform SDK
        // This avoids the slow fallback chain
        if (isExchangeQuery && !hasOpenAIKey) {
          // Skip AI Agent SDK if not available, go straight to fallback
          console.log(`[Chat] 📊 Exchange query detected - skipping AI Agent SDK, using Developer Platform SDK directly...`);
        } else if (hasOpenAIKey && !isExchangeQuery) {
          // Priority 1: Try AI Agent SDK first if OPENAI_API_KEY is available (but skip for exchange queries)
          // If query doesn't have an address, try to use payer's address for balance/transaction queries
          if ((input.toLowerCase().includes("balance") || input.toLowerCase().includes("transaction")) && !input.toLowerCase().includes("0x") && verification.payer) {
            console.log(`[Chat] ℹ️ No address in query, using payer's address: ${verification.payer}`);
            enhancedInput = `${input} for address ${verification.payer}`;
          }
          const blockchainClient = createCryptoComClient();
          if (blockchainClient) {
            console.log(`[Chat] 🔗 Detected blockchain query, using Crypto.com AI Agent SDK...`);
            console.log(`[Chat] 📡 SDK Status: ACTIVE - Querying Cronos blockchain via Crypto.com AI Agent SDK`);
            try {
              // OPTIMIZATION: Add timeout to blockchain query to prevent long waits
              const blockchainQuery = enhancedInput.includes("for address") ? enhancedInput : input;
              const blockchainQueryPromise = executeBlockchainQuery(blockchainClient, blockchainQuery);
              const timeoutPromise = new Promise<string>((resolve) => 
                setTimeout(() => resolve("TIMEOUT"), 8000) // 8 second timeout
              );
              
              const blockchainResult = await Promise.race([blockchainQueryPromise, timeoutPromise]);
              
              if (blockchainResult === "TIMEOUT") {
                console.warn(`[Chat] ⚠️ Blockchain query timed out after 8s, skipping...`);
              } else if (blockchainResult && !blockchainResult.includes("not available") && !blockchainResult.includes("Error:") && !blockchainResult.includes("Could not find") && !blockchainResult.includes("403") && !blockchainResult.includes("Forbidden")) {
                realDataContext += `\n\n[Real Blockchain Data - Fetched via Crypto.com AI Agent SDK]:\n${blockchainResult}\n`;
                console.log(`[Chat] ✅ Blockchain data fetched successfully via Crypto.com AI Agent SDK`);
                console.log(`[Chat] 📊 SDK Result: ${blockchainResult.substring(0, 100)}...`);
                directSDKResult = blockchainResult; // Mark as successful
              } else {
                console.warn(`[Chat] ⚠️ AI Agent SDK returned error or unavailable: ${blockchainResult?.substring(0, 100)}`);
                // Check if it's a 403 error from Explorer API - this means we should try RPC fallback
                if (blockchainResult && (blockchainResult.includes("403") || blockchainResult.includes("Forbidden") || blockchainResult.includes("status code 403"))) {
                  console.log(`[Chat] 🔄 AI Agent SDK got 403 from Explorer API, trying RPC fallback for block queries...`);
                  // For block queries, try RPC directly
                  if (blockchainQuery.toLowerCase().includes('block')) {
                    try {
                      const { queryBlockInfoViaRPC } = require("../agent-engine/tools");
                      const rpcResult = await queryBlockInfoViaRPC(blockchainQuery);
                      if (rpcResult && !rpcResult.includes("Error:")) {
                        realDataContext += `\n\n[Real Blockchain Data - Fetched via RPC (AI Agent SDK Explorer API unavailable)]:\n${rpcResult}\n`;
                        console.log(`[Chat] ✅ Block data fetched successfully via RPC fallback`);
                        directSDKResult = rpcResult;
                      }
                    } catch (rpcError) {
                      console.warn(`[Chat] ⚠️ RPC fallback also failed:`, rpcError);
                    }
                  }
                }
                // If SDK couldn't find address, add helpful note
                if (blockchainResult && blockchainResult.includes("Could not find")) {
                  realDataContext += `\n\nNote: Please include a valid Ethereum address (starting with 0x) in your query, or the system will use your wallet address.`;
                }
              }
            } catch (error) {
              console.warn(`[Chat] ❌ Failed to fetch blockchain data via AI Agent SDK:`, error);
            }
          } else {
            console.log(`[Chat] ⚠️ Crypto.com AI Agent SDK client creation failed (check OPENAI_API_KEY and CRYPTO_COM_DEVELOPER_PLATFORM_API_KEY)`);
          }
        }
        
        // Priority 2: Fallback to Developer Platform SDK directly for Exchange/Defi/CronosID if AI Agent SDK didn't work
        if (!directSDKResult && (isExchangeQuery || isDefiQuery || isCronosIdQuery)) {
          try {
            if (isExchangeQuery) {
              if (inputLower.includes('get all tickers') || (inputLower.includes('all tickers') && inputLower.includes('get'))) {
                console.log(`[Chat] 📊 Exchange query - trying Developer Platform SDK fallback...`);
                const { getAllTickersViaSDK } = require("../agent-engine/tools");
                directSDKResult = await getAllTickersViaSDK();
              } else if (inputLower.includes('ticker') && (inputLower.includes('information') || inputLower.includes('of') || inputLower.includes('for'))) {
                console.log(`[Chat] 📊 Exchange ticker query - trying Developer Platform SDK fallback...`);
                const { getTickerByInstrumentViaSDK } = require("../agent-engine/tools");
                directSDKResult = await getTickerByInstrumentViaSDK(input);
              }
            } else if (isDefiQuery) {
              if (inputLower.includes('whitelisted tokens') && inputLower.includes('protocol')) {
                console.log(`[Chat] 🏦 Defi whitelisted tokens query - trying Developer Platform SDK fallback...`);
                const { getWhitelistedTokensViaSDK } = require("../agent-engine/tools");
                directSDKResult = await getWhitelistedTokensViaSDK(input);
              } else if (inputLower.includes('all farms') && inputLower.includes('protocol')) {
                console.log(`[Chat] 🏦 Defi all farms query - trying Developer Platform SDK fallback...`);
                const { getAllFarmsViaSDK } = require("../agent-engine/tools");
                directSDKResult = await getAllFarmsViaSDK(input);
              } else if (inputLower.includes('farm') && inputLower.includes('protocol') && inputLower.includes('symbol')) {
                console.log(`[Chat] 🏦 Defi farm by symbol query - trying Developer Platform SDK fallback...`);
                const { getFarmBySymbolViaSDK } = require("../agent-engine/tools");
                directSDKResult = await getFarmBySymbolViaSDK(input);
              }
            } else if (isCronosIdQuery) {
              if (inputLower.includes('resolve') && inputLower.includes('cronosid') && inputLower.includes('name')) {
                console.log(`[Chat] 🆔 CronosID resolve query - trying Developer Platform SDK fallback...`);
                const { resolveCronosIdNameViaSDK } = require("../agent-engine/tools");
                directSDKResult = await resolveCronosIdNameViaSDK(input);
              } else if (inputLower.includes('lookup') && inputLower.includes('cronosid') && input.match(/0x[a-fA-F0-9]{40}/)) {
                console.log(`[Chat] 🆔 CronosID lookup query - trying Developer Platform SDK fallback...`);
                const { lookupCronosIdAddressViaSDK } = require("../agent-engine/tools");
                directSDKResult = await lookupCronosIdAddressViaSDK(input);
              }
            }
            
            if (directSDKResult) {
              realDataContext += `\n\n[Real Data - Fetched via Crypto.com Developer Platform SDK (fallback)]:\n${directSDKResult}\n`;
              console.log(`[Chat] ✅ Data fetched successfully via Developer Platform SDK (fallback)`);
            }
          } catch (error) {
            console.warn(`[Chat] ⚠️ Developer Platform SDK fallback also failed:`, error);
          }
        }
        
        // For other blockchain queries (not Exchange/Defi/CronosID), use AI Agent SDK if available
        if (!directSDKResult && !isExchangeQuery && !isDefiQuery && !isCronosIdQuery) {
          // If query doesn't have an address, try to use payer's address for balance queries
          if (input.toLowerCase().includes("balance") && !input.toLowerCase().includes("0x") && verification.payer) {
            console.log(`[Chat] ℹ️ No address in balance query, using payer's address: ${verification.payer}`);
            enhancedInput = `${input} for address ${verification.payer}`;
          }
          const blockchainClient = createCryptoComClient();
          if (blockchainClient) {
            console.log(`[Chat] 🔗 Detected blockchain query, using Crypto.com AI Agent SDK...`);
            console.log(`[Chat] 📡 SDK Status: ACTIVE - Querying Cronos blockchain via Crypto.com AI Agent SDK`);
            try {
              // Use enhancedInput which may include payer's address
              const blockchainQuery = enhancedInput.includes("for address") ? enhancedInput : input;
              const blockchainResult = await executeBlockchainQuery(blockchainClient, blockchainQuery);
              if (blockchainResult && !blockchainResult.includes("not available") && !blockchainResult.includes("Error:") && !blockchainResult.includes("Could not find") && !blockchainResult.includes("403") && !blockchainResult.includes("Forbidden")) {
                realDataContext += `\n\n[Real Blockchain Data - Fetched via Crypto.com AI Agent SDK]:\n${blockchainResult}\n`;
                console.log(`[Chat] ✅ Blockchain data fetched successfully via Crypto.com AI Agent SDK`);
                console.log(`[Chat] 📊 SDK Result: ${blockchainResult.substring(0, 100)}...`);
              } else {
                console.warn(`[Chat] ⚠️ SDK returned error or unavailable: ${blockchainResult}`);
                // Check if it's a 403 error from Explorer API - this means we should try RPC fallback
                if (blockchainResult && (blockchainResult.includes("403") || blockchainResult.includes("Forbidden") || blockchainResult.includes("status code 403"))) {
                  console.log(`[Chat] 🔄 AI Agent SDK got 403 from Explorer API, trying RPC fallback for block queries...`);
                  // For block queries, try RPC directly
                  if (blockchainQuery.toLowerCase().includes('block')) {
                    try {
                      const { queryBlockInfoViaRPC } = require("../agent-engine/tools");
                      const rpcResult = await queryBlockInfoViaRPC(blockchainQuery);
                      if (rpcResult && !rpcResult.includes("Error:")) {
                        realDataContext += `\n\n[Real Blockchain Data - Fetched via RPC (AI Agent SDK Explorer API unavailable)]:\n${rpcResult}\n`;
                        console.log(`[Chat] ✅ Block data fetched successfully via RPC fallback`);
                      }
                    } catch (rpcError) {
                      console.warn(`[Chat] ⚠️ RPC fallback also failed:`, rpcError);
                    }
                  }
                }
                // If SDK couldn't find address, add helpful note
                if (blockchainResult && blockchainResult.includes("Could not find")) {
                  realDataContext += `\n\nNote: Please include a valid Ethereum address (starting with 0x) in your query, or the system will use your wallet address.`;
                }
                // Don't add error to context - let agent work without blockchain data
              }
            } catch (error) {
              console.warn(`[Chat] ❌ Failed to fetch blockchain data via SDK:`, error);
              // Don't fail the entire request - continue without blockchain data
            }
          } else {
            console.log(`[Chat] ⚠️ Crypto.com AI Agent SDK not configured (missing OPENAI_API_KEY - required for AI Agent SDK)`);
          }
        }
      }
    }

    // Swap data is now fetched in parallel above - context already added

    // Process transfer requests using SDK's Token.transfer() (returns magic links)
    if (needsTransfer) {
      try {
        // Extract transfer parameters - handle both "send X TOKEN to 0x..." and "send X TOKEN 0x..." formats
        // Also handle "testnet cro", "testnet CRO", etc.
        // Pattern: (transfer|send) amount (optional words like "testnet") token (to)? address
        let transferMatch = input.match(/(?:transfer|send)\s+(\d+(?:\.\d+)?)\s+((?:\w+\s+)*?)(\w+)\s+to\s+(0x[a-fA-F0-9]{40})/i);
        if (!transferMatch) {
          // Try without "to" - "send X TOKEN 0x..."
          transferMatch = input.match(/(?:transfer|send)\s+(\d+(?:\.\d+)?)\s+((?:\w+\s+)*?)(\w+)\s+(0x[a-fA-F0-9]{40})/i);
        }
        
        if (transferMatch) {
          const amount = transferMatch[1];
          const optionalWords = (transferMatch[2] || '').trim(); // e.g., "testnet "
          let tokenSymbol = (transferMatch[3] || '').toUpperCase(); // e.g., "cro"
          const toAddress = transferMatch[4];
          
          // Combine optional words with token symbol for normalization
          const fullTokenString = (optionalWords + ' ' + tokenSymbol).trim().toUpperCase();
          
          // Handle "testnet cro", "testnet CRO", "TCRO" variations
          // Normalize token symbol - remove "TESTNET" prefix if present
          if (fullTokenString.includes('TESTNET')) {
            tokenSymbol = fullTokenString.replace(/TESTNET/gi, '').trim() || 'CRO';
          }
          if (tokenSymbol === 'TCRO') {
            tokenSymbol = 'CRO'; // Treat testnet CRO as CRO for native transfer
          }
          
          // Check for contract address for ERC-20 tokens
          const contractMatch = input.match(/contract[:\s]+(0x[a-fA-F0-9]{40})/i);
          const contractAddress = contractMatch ? contractMatch[1] : undefined;
          
          const isNativeToken = tokenSymbol === 'CRO' || tokenSymbol === 'NATIVE';
          
          console.log(`[Chat] 💸 Processing transfer: ${amount} ${tokenSymbol} to ${toAddress}`);
          
          // Call SDK's Token.transfer() to get magic link
          // Use Developer Platform SDK (not AI Agent SDK) for Token.transfer()
          const { initDeveloperPlatformSDK } = require("../agent-engine/tools");
          const sdk = initDeveloperPlatformSDK();
          
          if (sdk && sdk.Token) {
            try {
              let transferResponse;
              
              // SDK gets provider from Client.getProvider() (set in Client.init())
              // Don't pass provider in payload - SDK handles it automatically
              if (isNativeToken) {
                console.log(`[Chat] 💸 Calling Token.transfer() for native CRO`);
                console.log(`[Chat] 💸 Transfer params:`, { to: toAddress, amount: parseFloat(amount) });
                transferResponse = await sdk.Token.transfer({
                  to: toAddress,
                  amount: parseFloat(amount)
                });
              } else if (contractAddress) {
          console.log(`[Chat] 💸 Calling Token.transfer() for ERC-20 token`);
          
          // Following SDK documentation in tokensdk.md: use raw human-readable amount as a number
          const transferAmount = Number(amount);

          console.log(`[Chat] 💸 Transfer params:`, { to: toAddress, amount: transferAmount, contractAddress });
          
          transferResponse = await sdk.Token.transfer({
            to: toAddress,
            amount: transferAmount, 
            contractAddress: contractAddress
          });
        } else {
                console.warn(`[Chat] ⚠️ ERC-20 transfer requires contract address`);
                // Will be handled by agent response
              }
              
              if (transferResponse) {
                console.log(`[Chat] 💸 Transfer response:`, JSON.stringify(transferResponse, null, 2).substring(0, 200));
                const responseData = transferResponse?.data || transferResponse;
                const magicLink = responseData?.magicLink || responseData?.magic_link || responseData?.link;
                
                if (magicLink) {
                  transferMagicLink = {
                    url: magicLink,
                    amount: amount,
                    token: tokenSymbol,
                    to: toAddress,
                    type: isNativeToken ? 'native' : 'erc20'
                  };
                  console.log(`[Chat] ✅ Magic link generated for transfer: ${magicLink.substring(0, 50)}...`);
                } else {
                  console.warn(`[Chat] ⚠️ Transfer response received but no magic link found:`, transferResponse);
                }
              }
            } catch (transferError: any) {
              console.error(`[Chat] ⚠️ Error calling SDK Token.transfer():`, transferError);
              console.error(`[Chat] Transfer parameters attempted:`, {
                to: toAddress,
                amount: amount,
                tokenSymbol,
                isNativeToken,
                contractAddress: contractAddress || 'N/A'
              });
              
              // Check if error is about missing provider
              if (transferError.message && transferError.message.includes('provider')) {
                console.error(`[Chat] ⚠️ Provider URL is required for Token.transfer()`);
                console.error(`[Chat] ⚠️ See backend/PROVIDER_URL_GUIDE.md for how to get provider URL`);
                console.error(`[Chat] ⚠️ Set CRYPTO_COM_PROVIDER or CRYPTO_COM_SSO_WALLET_URL in .env`);
                console.error(`[Chat] ⚠️ Provider URL can be found in Crypto.com Developer Platform dashboard`);
              }
              
              // Continue - agent will handle the error in response
            }
          } else {
            console.warn(`[Chat] ⚠️ Developer Platform SDK not available for Token.transfer()`);
          }
        }
      } catch (transferError) {
        console.warn(`[Chat] ⚠️ Error processing transfer request:`, transferError);
      }
    }

    // Portfolio and transaction history are now fetched in parallel above

    // Get network info for system prompt (if not already set in swap context)
    const rpcUrl = process.env.CRONOS_RPC_URL || "https://evm-t3.cronos.org";
    const isTestnet = rpcUrl.includes("evm-t3") || rpcUrl.includes("testnet");
    const network = isTestnet ? "Testnet" : "Mainnet";
    const vvsRouter = isTestnet 
      ? (process.env.VVS_ROUTER_ADDRESS_TESTNET || "Not deployed on testnet - use mock mode")
      : (process.env.VVS_ROUTER_ADDRESS || "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae");

    // Build system prompt based on detected needs
    let systemPrompt = `You are OneChat, a unified AI assistant with access to multiple tools and capabilities.

## Your Capabilities:
${needsMarketData ? "- **Market Data**: You have access to real-time cryptocurrency prices and market data from Crypto.com Exchange\n" : ""}
${needsBlockchain ? "- **Blockchain**: You can query Cronos EVM blockchain data (balances, transactions, contracts)\n" : ""}
${needsContractAnalysis ? "- **Contract Analysis**: You can analyze Solidity smart contracts for security issues\n" : ""}
${needsContent ? "- **Content Generation**: You can create marketing content, tweets, and Web3 copy\n" : ""}
${needsSwap ? `- **Token Swaps**: You can help users swap tokens on VVS Finance DEX (Cronos ${network})\n` : ""}

## Your Task:
- Analyze the user's question
- Use the real data provided to you (if any)
- Provide a helpful, accurate, and professional response
- Be clear and actionable
- **IMPORTANT**: If real blockchain data is provided, use it directly. If no real data is provided, explain that blockchain query services are currently unavailable, but you can provide general information about how to check balances using blockchain explorers.

${needsSwap ? `## Token Swap Instructions (VVS Finance):
When users ask about token swaps:
1. **Network Detection**: Backend is configured for Cronos ${network}
2. **VVS Router**: ${vvsRouter}
3. **Agent-Driven Workflow**: 
   - I automatically detect swap requests and extract parameters (amount, tokens)
   - I can fetch quotes from either mainnet or testnet based on user request or backend config
   - If user says "on mainnet" or "mainnet quote", fetch from mainnet VVS Finance (even if backend is on testnet)
   - Otherwise, use backend's network configuration
   - I provide the quote and swap details to the user
   - Swaps require x402 payment ($0.15 per swap execution via /api/vvs-swap/execute)
4. **Network Requirements**: 
   - Users can request mainnet quotes even if their wallet is on testnet
   - If quote is from mainnet: User MUST switch wallet to Cronos Mainnet (Chain ID: 25) to execute
   - If quote is from testnet: May use mock mode, inform user about mainnet for real swaps
   - Always clearly state which network the quote is from
5. **Response Format**: 
   - If I have a live quote: Show the exact quote with amounts, path, and network
   - Clearly state which network the quote is from (Mainnet/Testnet)
   - If mainnet quote: Warn user they need to switch wallet to mainnet (Chain ID: 25)
   - Explain the swap will cost $0.15 via x402 payment
   - Provide the swap parameters ready for execution
   - Guide users to execute via the swap API endpoint
6. **Examples**: 
   - "swap 100 CRO for USDC" → Use backend's network (testnet or mainnet)
   - "swap 100 CRO for USDC on mainnet" → Fetch from mainnet VVS Finance, warn about wallet switch
   - "get mainnet quote for 50 CRO to USDC" → Fetch mainnet quote regardless of backend config

` : ""}
## Response Format:
- If you have real blockchain data: Present it clearly with the actual values
- If you DON'T have real data: Explain that the blockchain query service is unavailable and suggest using a blockchain explorer like Cronos Explorer (https://explorer.cronos.org/testnet) to check the balance manually
- **DO NOT** show Python code or tool_code commands - provide natural language responses only
- For swap requests: Provide clear, helpful guidance about the swap process, network, and requirements

User Input:
`;

    const UNIFIED_AGENT_ID = 1;
    const enhancedInputWithData = enhancedInput + realDataContext;
    
    console.log(`[Chat] Executing agent with prompt (Agent ID: ${UNIFIED_AGENT_ID})...`);
    
    // Execute agent
    let result;
    try {
      result = await executeAgentWithPrompt(UNIFIED_AGENT_ID, enhancedInputWithData, systemPrompt);
      console.log(`[Chat] ✅ Agent execution successful: ${result.success ? "SUCCESS" : "FAILED"}`);
    } catch (execError) {
      console.error("[Chat] ❌ Agent execution failed:", execError);
      result = {
        output: "Agent execution failed: " + (execError instanceof Error ? execError.message : String(execError)),
        success: false,
      };
    }
    
    // Log execution to database
    try {
      db.addExecution({
        executionId: Date.now(),
        agentId: UNIFIED_AGENT_ID,
        agentName: "Unified Chat Agent",
        userId: verification.payer || "unknown",
        paymentHash: solanaSignature,
        input: enhancedInputWithData,
        output: result.output || "",
        success: result.success,
        timestamp: Date.now(),
        verified: true,
      });
    } catch (dbError) {
      console.warn(`[Chat] ⚠️ Failed to log execution:`, dbError);
    }

    const responseData: any = {
      executionId: Date.now(),
      output: result.output,
      success: result.success,
      payerAddress: verification.payer,
    };

    // Include swap transaction data if available
    if (swapTransactionData && swapQuoteInfo) {
      responseData.swapTransaction = swapTransactionData;
      responseData.swapQuote = swapQuoteInfo;
    }

    // Include transfer magic link if available
    if (transferMagicLink) {
      responseData.transferMagicLink = transferMagicLink;
    }

    // Include portfolio data if available
    if (portfolioData) {
      responseData.portfolio = portfolioData;
    }

    // Include transaction history if available
    if (transactionHistory) {
      responseData.transactionHistory = transactionHistory;
    }

    res.json(responseData);
  } catch (error) {
    console.error("❌ Error in chat endpoint:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    console.error("Error details:", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
      body: req.body,
      headers: {
        "x-payment": req.headers["x-payment"] ? "present" : "missing",
        "x-payment-signature": req.headers["x-payment-signature"] ? "present" : "missing",
      },
    });
    
    // Import error handler
    try {
      const { sendErrorResponse } = require("../utils/errorHandler");
      sendErrorResponse(
        res,
        error,
        "Failed to process chat message",
        500
      );
    } catch (handlerError) {
      console.error("❌ Error handler also failed:", handlerError);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : String(error),
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : String(error)) : undefined,
      });
    }
  }
});

/**
 * Execute agent with custom prompt (for unified chat)
 */
async function executeAgentWithPrompt(
  agentId: number,
  input: string,
  customPrompt: string
): Promise<{ output: string; success: boolean }> {
  // Try Gemini first, fallback to OpenRouter
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const openRouterModel = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
  
  let useOpenRouter = false;
  let model: any;
  let modelName: string;
  
  if (geminiApiKey) {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    console.log(`[Chat] 🔑 Using Gemini API key (length: ${geminiApiKey.length}, starts with: ${geminiApiKey.substring(0, 10)}...)`);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    modelName = "gemini-2.5-flash";
    console.log(`[Chat] ✅ Gemini client initialized with model: ${modelName}`);
  } else if (openRouterKey) {
    useOpenRouter = true;
    const { OpenAI } = await import("openai");
    model = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: openRouterKey,
      defaultHeaders: {
        "HTTP-Referer": "https://onechat.app",
        "X-Title": "OneChat",
      },
    });
    modelName = openRouterModel;
    console.log(`[Chat] 🔄 Using OpenRouter (model: ${modelName})`);
  } else {
    console.error(`[Chat] ❌ No AI provider configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY`);
    return {
      output: "AI provider not configured. Please set GEMINI_API_KEY or OPENROUTER_API_KEY in backend/.env",
      success: false,
    };
  }

  // Build prompt (for Gemini) or use messages format (for OpenRouter)
  const prompt = `${customPrompt}${input}`;

  // Retry logic
  let output: string | undefined = undefined;
  let lastError: Error | null = null;
  const maxRetries = 3;
  const retryDelay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[Chat] 🔄 ${useOpenRouter ? 'OpenRouter' : 'Gemini'} API retry attempt ${attempt}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
      
      console.log(`[Chat] 📤 Calling ${useOpenRouter ? 'OpenRouter' : 'Gemini'} API (attempt ${attempt}/${maxRetries})...`);
      console.log(`[Chat] Prompt length: ${prompt.length} characters`);
      
      if (useOpenRouter) {
        const completion = await model.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: customPrompt },
            { role: "user", content: input }
          ],
          temperature: 0.7,
        });
        output = completion.choices[0]?.message?.content || "";
      } else {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        output = response.text();
      }
      console.log(`[Chat] ✅ ${useOpenRouter ? 'OpenRouter' : 'Gemini'} API call successful (response length: ${output?.length || 0})`);
      break;
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || error?.status || "unknown";
      const errorStatus = error?.statusCode || "unknown";
      
      console.error(`[Chat] ❌ ${useOpenRouter ? 'OpenRouter' : 'Gemini'} API call failed (attempt ${attempt}/${maxRetries}):`, {
        message: errorMessage,
        code: errorCode,
        status: errorStatus,
        name: error?.name,
        stack: error?.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
      });
      
      // If Gemini quota exceeded and OpenRouter available, switch to OpenRouter
      if (!useOpenRouter && errorMessage.includes("quota") && openRouterKey && attempt === 1) {
        console.warn(`[Chat] ⚠️  Gemini quota exceeded, switching to OpenRouter fallback...`);
        try {
          const { OpenAI } = await import("openai");
          useOpenRouter = true;
          model = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: openRouterKey,
            defaultHeaders: {
              "HTTP-Referer": "https://onechat.app",
              "X-Title": "OneChat",
            },
          });
          modelName = openRouterModel;
          console.log(`[Chat] 🔄 Now using OpenRouter (model: ${modelName})`);
          continue; // Retry with OpenRouter
        } catch (importError) {
          console.warn(`[Chat] ⚠️  Failed to import OpenAI package for OpenRouter fallback`);
        }
      }
      
      // Handle OpenRouter data policy error
      if (useOpenRouter && errorMessage.includes("data policy") && errorMessage.includes("Free model publication")) {
        console.error(`[Chat] ❌ OpenRouter data policy not configured for free models`);
        console.error(`[Chat] 💡 Fix: Go to https://openrouter.ai/settings/privacy and enable "Free model publication"`);
        return {
          output: "OpenRouter data policy not configured. Please enable 'Free model publication' in your OpenRouter privacy settings: https://openrouter.ai/settings/privacy",
          success: false,
        };
      }
      
      const isRetryable = errorMessage.includes("503") || 
                         errorMessage.includes("429") || 
                         errorMessage.includes("500") ||
                         errorMessage.includes("overloaded") ||
                         errorMessage.includes("quota") ||
                         errorMessage.includes("rate limit") ||
                         errorCode === 503 ||
                         errorCode === 429 ||
                         errorStatus === 503 ||
                         errorStatus === 429;
      
      if (isRetryable && attempt < maxRetries) {
        console.log(`[Chat] ⚠️ Retryable error detected, will retry...`);
        continue;
      } else {
        console.error(`[Chat] ❌ Non-retryable error or max retries reached, throwing error`);
        throw error;
      }
    }
  }

  if (!output) {
    const errorMsg = lastError ? (lastError instanceof Error ? lastError.message : String(lastError)) : "Failed to get response from AI service";
    console.error(`[Chat] ❌ AI API failed after ${maxRetries} attempts:`, errorMsg);
    
    // Provide user-friendly error message for rate limits
    if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("rate limit") || errorMsg.includes("RateLimitError")) {
      const friendlyError = new Error("AI service rate limit exceeded. The free tier quota may be exhausted. Please try again in a few minutes or use a paid API key.");
      throw friendlyError;
    }
    
    throw lastError || new Error(errorMsg);
  }
  
  console.log(`[Chat] ✅ Gemini API response received (length: ${output.length})`);

  const isValidLength = output.length > 10 && output.length < 100000;
  const looksLikeError = output.length < 100 && (
    output.toLowerCase().startsWith("error") || 
    output.toLowerCase().startsWith("failed") ||
    output.toLowerCase().includes("exception:") ||
    output.toLowerCase().includes("api key")
  );

  const success = isValidLength && !looksLikeError;

  return {
    output,
    success,
  };
}

export default router;