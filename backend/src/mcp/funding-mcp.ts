import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ethers } from "ethers";
import { getProvider } from "../lib/contract";

// Constants for Cronos Testnet
const CRONOS_TESTNET_ID = 338;
const USDC_CRONOS_TESTNET = "0xc01efAaF7C5C61bEbFAeb358E1161b537b8bC0e0";
const MIN_TCRO_FOR_GAS = 0.5;
const MIN_USDC_FOR_PAYMENT = 0.1;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/**
 * Nullshot-compatible MCP Server for Funding Assistant
 */
export class FundingMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "electro-vault-funding-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupTools();
  }

  private setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_funding_status",
          description: "Check the funding status of a wallet (TCRO and devUSDC.e balance)",
          inputSchema: {
            type: "object",
            properties: {
              address: { type: "string", description: "The Ethereum address to check" },
            },
            required: ["address"],
          },
        },
        {
          name: "get_faucet_links",
          description: "Get the official faucet links for Cronos Testnet assets",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "get_funding_status") {
        const address = args?.address as string;
        return await this.getFundingStatus(address);
      }

      if (name === "get_faucet_links") {
        return this.getFaucetLinks();
      }

      throw new Error(`Tool not found: ${name}`);
    });
  }

  private async getFundingStatus(address: string) {
    try {
      if (!ethers.isAddress(address)) {
        return {
          content: [{ type: "text", text: `Invalid address: ${address}` }],
          isError: true,
        };
      }

      const provider = getProvider();
      
      // 1. Check TCRO Balance
      const tcroBalanceRaw = await provider.getBalance(address);
      const tcroBalanceNum = parseFloat(ethers.formatEther(tcroBalanceRaw));

      // 2. Check USDC Balance
      const usdcContract = new ethers.Contract(USDC_CRONOS_TESTNET, ERC20_ABI, provider);
      const usdcBalanceRaw = await usdcContract.balanceOf(address);
      const usdcBalanceNum = parseFloat(ethers.formatUnits(usdcBalanceRaw, 6));

      const hasGas = tcroBalanceNum >= MIN_TCRO_FOR_GAS;
      const hasUsdc = usdcBalanceNum >= MIN_USDC_FOR_PAYMENT;

      const report = {
        address,
        network: "Cronos Testnet (Chain 338)",
        balances: {
          TCRO: tcroBalanceNum,
          devUSDCe: usdcBalanceNum,
        },
        requirements: {
          minTCRO: MIN_TCRO_FOR_GAS,
          minUSDC: MIN_USDC_FOR_PAYMENT,
        },
        status: {
          hasEnoughGas: hasGas,
          hasEnoughUsdc: hasUsdc,
          ready: hasGas && hasUsdc,
        },
        advice: !hasGas 
          ? "You need more TCRO for gas. Visit the official faucet." 
          : !hasUsdc 
          ? "You need devUSDC.e for agent payments. Use the faucet or a swap." 
          : "Your wallet is fully funded and ready to go!"
      };

      return {
        content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error checking funding status: ${error.message}` }],
        isError: true,
      };
    }
  }

  private getFaucetLinks() {
    const links = [
      {
        name: "Official Cronos Faucet (TCRO & devUSDC.e)",
        url: "https://cronos.org/faucet",
        instructions: "Connect your wallet or paste address to receive test assets."
      }
    ];

    return {
      content: [{ type: "text", text: JSON.stringify(links, null, 2) }],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("Funding MCP Server running on stdio");
  }
}
