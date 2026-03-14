import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import bs58 from "bs58";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");

async function setupFaucet() {
  console.log("Setting up Custom Devnet USDC Faucet...");

  // Generate a keypair for our backend faucet
  const faucetKeypair = Keypair.generate();
  console.log("Faucet Public Key:", faucetKeypair.publicKey.toBase58());
  console.log("Faucet Private Key:", bs58.encode(faucetKeypair.secretKey));
  console.log("\n-> ADD THIS TO backend/.env as SOLANA_FAUCET_PRIVATE_KEY\n");

  // Airdrop SOL to the faucet payer
  console.log("Airdropping 0.05 SOL to the faucet account...");
  const signature = await connection.requestAirdrop(faucetKeypair.publicKey, 0.05 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(signature);
  console.log("Airdrop complete!");

  // Create our custom Devnet USDC Mint
  console.log("Creating Custom USDC Mint...");
  const usdcMint = await createMint(
    connection,
    faucetKeypair,
    faucetKeypair.publicKey, // mint authority
    null, // freeze authority
    6 // 6 decimals like real USDC
  );

  console.log("\n===========================");
  console.log("Custom Devnet USDC Mint:", usdcMint.toBase58());
  console.log("===========================\n");
  console.log("-> UPDATE frontend/.env.local and backend/.env with this Mint Address");

  // Save to a file for reference
  fs.writeFileSync(
    path.join(__dirname, "faucet-keys.json"),
    JSON.stringify({
      mintAddress: usdcMint.toBase58(),
      publicKey: faucetKeypair.publicKey.toBase58(),
      privateKey: bs58.encode(faucetKeypair.secretKey)
    }, null, 2)
  );
  
  console.log("Keys saved to scripts/faucet-keys.json");
}

setupFaucet().catch(console.error);
