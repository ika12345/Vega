import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const REGISTRY_WALLET = process.env.SOLANA_REGISTRY_WALLET || "4hpxkCZuj5WvNtStmPZq8D1WheFZwjAAGyqjQUaeX4e9";

export async function verifySolanaTransaction(signature: string, expectedLamports?: number): Promise<{ valid: boolean; payer?: string; error?: string }> {
  try {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    
    // Get transaction details
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error: "Transaction not found" };
    }

    // Verify destination and amount
    const registryPubKey = new PublicKey(REGISTRY_WALLET);
    let foundTransfer = false;
    let payer = "";

    // Check message account keys for destination
    const accountKeys = tx.transaction.message.getAccountKeys();
    const registryIndex = accountKeys.staticAccountKeys.findIndex(key => key.equals(registryPubKey));

    if (registryIndex === -1) {
      return { valid: false, error: "Incorrect destination address" };
    }

    // Check balances
    const meta = tx.meta;
    if (!meta) return { valid: false, error: "Transaction meta missing" };

    const postBalance = meta.postBalances[registryIndex];
    const preBalance = meta.preBalances[registryIndex];
    const actualLamports = postBalance - preBalance;

    if (expectedLamports && actualLamports < expectedLamports) {
      return { valid: false, error: `Insufficient amount. Expected ${expectedLamports} lamports, got ${actualLamports}` };
    }

    // Payer is the first account in the transaction
    payer = accountKeys.staticAccountKeys[0].toBase58();

    return { valid: true, payer };
  } catch (error: any) {
    console.error("Solana verification error:", error);
    return { valid: false, error: error.message };
  }
}
