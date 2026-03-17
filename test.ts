/**
 * End-to-end test script for the Stable Agentic Platform.
 * Runs all three demo flows: wallet check → catalog → quote → invoke (with real x402 payment).
 *
 * Usage:
 *   MNEMONIC="your twelve word seed phrase here" tsx test.ts
 *   MNEMONIC="..." tsx test.ts --service llm   (test only LLM)
 *   MNEMONIC="..." tsx test.ts --service article
 *   MNEMONIC="..." tsx test.ts --service chain-rpc
 */

import { config } from "dotenv";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, http, erc20Abi, defineChain } from "viem";

config({ path: "packages/local-mcp/.env" });

const FOUNDATION_MCP_URL = process.env.FOUNDATION_MCP_URL || "http://localhost:3001";
const STABLE_RPC = "https://rpc.stable.xyz";
const USDT0_STABLE = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" as const;

const stableChain = defineChain({
  id: 988,
  name: "Stable",
  nativeCurrency: { name: "USDT0", symbol: "USDT0", decimals: 6 },
  rpcUrls: { default: { http: [STABLE_RPC] } },
});

const publicClient = createPublicClient({ chain: stableChain, transport: http() });

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

async function main() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    console.error("Set MNEMONIC env var to run payment tests.");
    console.error("Example: MNEMONIC='word1 word2 ...' tsx test.ts");
    process.exit(1);
  }

  const targetService = process.argv.includes("--service")
    ? process.argv[process.argv.indexOf("--service") + 1]
    : null;

  // ── 1. Wallet ───────────────────────────────────────────────────────────────
  section("1. Wallet Status");

  const account = await new WalletManagerEvm(mnemonic, { provider: STABLE_RPC }).getAccount();
  console.log(`Address: ${account.address}`);

  const balance = await publicClient.readContract({
    address: USDT0_STABLE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address as `0x${string}`],
  });
  console.log(`USDT0 Balance: $${(Number(balance) / 1_000_000).toFixed(6)}`);

  if (balance === 0n) {
    console.error("\nWallet has no USDT0 on Stable mainnet. Fund it first.");
    process.exit(1);
  }

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // ── 2. Catalog ──────────────────────────────────────────────────────────────
  section("2. Catalog Search");

  const catalogRes = await fetch(`${FOUNDATION_MCP_URL}/catalog`);
  const catalog = await catalogRes.json() as { services: Array<{ id: string; name: string; priceDisplay: string; category: string }> };
  console.log(`Found ${catalog.services.length} services:`);
  for (const svc of catalog.services) {
    const marker = targetService === svc.id ? " ◀" : "";
    console.log(`  [${svc.id}]  ${svc.name}  (${svc.priceDisplay})${marker}`);
  }

  const servicesToTest = targetService
    ? catalog.services.filter((s) => s.id === targetService)
    : catalog.services;

  // ── 3. Test each service ────────────────────────────────────────────────────
  for (const svc of servicesToTest) {
    section(`3. Testing: ${svc.name}`);

    // Quote
    console.log("Fetching quote...");
    const quoteRes = await fetch(`${FOUNDATION_MCP_URL}/service/${svc.id}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getTestArgs(svc.id)),
    });
    const quote = await quoteRes.json();
    console.log(`Quote: ${JSON.stringify(quote)}`);

    // Invoke with payment
    console.log(`\nInvoking (will auto-pay via x402)...`);
    const invokeRes = await fetchWithPayment(`${FOUNDATION_MCP_URL}/service/${svc.id}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getTestArgs(svc.id)),
    });

    if (!invokeRes.ok) {
      const body = await invokeRes.text();
      console.error(`Invoke failed (${invokeRes.status}): ${body}`);
      continue;
    }

    const result = await invokeRes.json();

    // Payment receipt
    const paymentHeader = invokeRes.headers.get("X-PAYMENT-RESPONSE");
    if (paymentHeader) {
      const payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
      console.log(`\nPayment settled:`);
      console.log(`  tx:      ${payment.transaction}`);
      console.log(`  network: ${payment.network}`);
      console.log(`  payer:   ${payment.payer}`);
    }

    // Show result summary
    console.log("\nResult:");
    console.log(formatResult(svc.id, result));
  }

  // ── Final balance ───────────────────────────────────────────────────────────
  section("Final Balance");
  const finalBalance = await publicClient.readContract({
    address: USDT0_STABLE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address as `0x${string}`],
  });
  const spent = Number(balance - finalBalance) / 1_000_000;
  console.log(`USDT0 Balance: $${(Number(finalBalance) / 1_000_000).toFixed(6)}`);
  console.log(`Total spent:   $${spent.toFixed(6)} USDT0`);
}

function getTestArgs(serviceId: string): object {
  switch (serviceId) {
    case "article-citrini":
      return {};
    case "llm-claude":
      return {
        system: "You are a concise financial analyst.",
        prompt: "In 2 sentences, what is the outlook for Bitcoin in a global liquidity expansion?",
        max_tokens: 256,
      };
    case "chain-rpc-base":
      return {
        method: "get_token_balance",
        address: "0x4200000000000000000000000000000000000006", // WETH on Base
        token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC on Base
      };
    default:
      return {};
  }
}

function formatResult(serviceId: string, result: unknown): string {
  const r = result as Record<string, unknown>;
  switch (serviceId) {
    case "article-citrini":
      return `  Title: ${r.title}\n  Author: ${r.author}\n  Words: ${r.word_count}\n  Preview: ${String(r.content).slice(0, 120)}...`;
    case "llm-claude":
      return `  Response: ${r.content}\n  Tokens: ${JSON.stringify(r.usage)}`;
    case "chain-rpc-base":
      return `  ${JSON.stringify(result, null, 2).split("\n").join("\n  ")}`;
    default:
      return JSON.stringify(result, null, 2);
  }
}

main().catch((err) => {
  console.error("\nFatal:", err.message ?? err);
  process.exit(1);
});
