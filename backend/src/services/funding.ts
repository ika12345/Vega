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

export interface FundingStatus {
  address: string;
  balances: {
    tcro: number;
    usdc: number;
  };
  requirements: {
    minTcro: number;
    minUsdc: number;
  };
  status: {
    hasGas: boolean;
    hasUsdc: boolean;
    isReady: boolean;
  };
}

export class FundingService {
  static async getStatus(address: string): Promise<FundingStatus> {
    if (!ethers.isAddress(address)) {
      throw new Error("Invalid address");
    }

    const provider = getProvider();
    
    // Check TCRO
    const tcroBalanceRaw = await provider.getBalance(address);
    const tcroBalanceNum = parseFloat(ethers.formatEther(tcroBalanceRaw));

    // Check USDC
    const usdcContract = new ethers.Contract(USDC_CRONOS_TESTNET, ERC20_ABI, provider);
    const usdcBalanceRaw = await usdcContract.balanceOf(address);
    const usdcBalanceNum = parseFloat(ethers.formatUnits(usdcBalanceRaw, 6));

    const hasGas = tcroBalanceNum >= MIN_TCRO_FOR_GAS;
    const hasUsdc = usdcBalanceNum >= MIN_USDC_FOR_PAYMENT;

    return {
      address,
      balances: {
        tcro: tcroBalanceNum,
        usdc: usdcBalanceNum,
      },
      requirements: {
        minTcro: MIN_TCRO_FOR_GAS,
        minUsdc: MIN_USDC_FOR_PAYMENT,
      },
      status: {
        hasGas,
        hasUsdc,
        isReady: hasGas && hasUsdc,
      },
    };
  }

  static getFaucetLinks() {
    return [
      {
        name: "Official Cronos Faucet",
        url: "https://cronos.org/faucet",
        description: "Get TCRO and devUSDC.e for testing."
      }
    ];
  }
}
