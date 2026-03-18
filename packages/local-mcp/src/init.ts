/**
 * One-time wallet initialization.
 * Generates a private key, saves it to ~/.stable-mcp/wallet.json,
 * and prints the wallet address + USDT0 balance.
 *
 * Run: npm run init --workspace=packages/local-mcp
 */

import { config } from "dotenv";
import { createPublicClient, http, erc20Abi, defineChain } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

config();

const STABLE_RPC = "https://rpc.stable.xyz";
const USDT0_STABLE = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" as const;
const WALLET_DIR = join(homedir(), ".stable-mcp");
const WALLET_FILE = join(WALLET_DIR, "wallet.json");

const stableChain = defineChain({
  id: 988,
  name: "Stable",
  nativeCurrency: { name: "USDT0", symbol: "USDT0", decimals: 6 },
  rpcUrls: { default: { http: [STABLE_RPC] } },
});

const publicClient = createPublicClient({ chain: stableChain, transport: http() });

async function main() {
  let privateKey: `0x${string}`;
  let isNew = false;

  if (process.env.PRIVATE_KEY) {
    privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    console.log("Using private key from PRIVATE_KEY env var.");
  } else if (existsSync(WALLET_FILE)) {
    const data = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));
    privateKey = data.privateKey;
    console.log(`Loaded existing wallet from ${WALLET_FILE}`);
  } else {
    privateKey = generatePrivateKey();
    isNew = true;
  }

  const account = privateKeyToAccount(privateKey);
  const address = account.address;

  if (isNew) {
    mkdirSync(WALLET_DIR, { recursive: true });
    writeFileSync(WALLET_FILE, JSON.stringify({ privateKey }, null, 2), { mode: 0o600 });
    console.log(`\nNew wallet created and saved to ${WALLET_FILE}`);
  }

  console.log(`\nWallet address : ${address}`);

  try {
    const balance = await publicClient.readContract({
      address: USDT0_STABLE,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    console.log(`USDT0 balance  : $${(Number(balance) / 1_000_000).toFixed(6)}`);
    if (balance === 0n) {
      console.log(`\nFund this address with USDT0 on Stable mainnet (chain ID 988).`);
      console.log(`Bridge at: https://usdt0.to/transfer`);
    }
  } catch {
    console.log("(Could not fetch balance — check RPC connectivity)");
  }

  if (isNew) {
    console.log(`\n⚠  BACK UP YOUR PRIVATE KEY before sending funds:`);
    console.log(`   ${privateKey}`);
    console.log(`\nTo use this wallet, either:`);
    console.log(`  1. Set PRIVATE_KEY="${privateKey}" in packages/local-mcp/.env`);
    console.log(`  2. Leave blank — the server reads from ${WALLET_FILE} automatically`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
