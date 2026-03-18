import { config } from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createPublicClient, http, erc20Abi, defineChain } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

config();

// ── Config ────────────────────────────────────────────────────────────────────

const STABLE_CHAIN_ID = 988;
const STABLE_RPC = "https://rpc.stable.xyz";
const USDT0_STABLE = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736" as const;
const FOUNDATION_MCP_URL = process.env.FOUNDATION_MCP_URL || "http://localhost:3001";
const WALLET_FILE = join(homedir(), ".stable-mcp", "wallet.json");

// ── Stable chain definition for viem ─────────────────────────────────────────

const stableChain = defineChain({
  id: STABLE_CHAIN_ID,
  name: "Stable",
  nativeCurrency: { name: "USDT0", symbol: "USDT0", decimals: 6 },
  rpcUrls: { default: { http: [STABLE_RPC] } },
});

const publicClient = createPublicClient({ chain: stableChain, transport: http() });

// ── Wallet setup ──────────────────────────────────────────────────────────────

function loadOrCreatePrivateKey(): `0x${string}` {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY as `0x${string}`;

  if (existsSync(WALLET_FILE)) {
    const data = JSON.parse(readFileSync(WALLET_FILE, "utf-8"));
    return data.privateKey;
  }

  const privateKey = generatePrivateKey();
  mkdirSync(join(homedir(), ".stable-mcp"), { recursive: true });
  writeFileSync(WALLET_FILE, JSON.stringify({ privateKey }, null, 2), { mode: 0o600 });

  process.stderr.write(`\n[stable-mcp] New wallet created — saved to ${WALLET_FILE}\n`);
  process.stderr.write(`[stable-mcp] BACK UP YOUR PRIVATE KEY before sending funds.\n\n`);

  return privateKey;
}

function initWallet() {
  const privateKey = loadOrCreatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  return { account, fetchWithPayment };
}

// ── Balance helper ────────────────────────────────────────────────────────────

async function getUSDT0Balance(address: `0x${string}`): Promise<{ raw: bigint; display: string }> {
  const raw = await publicClient.readContract({
    address: USDT0_STABLE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  const display = (Number(raw) / 1_000_000).toFixed(6);
  return { raw, display };
}

// ── Tool helpers ──────────────────────────────────────────────────────────────

async function catalogSearch(
  fmcpFetch: typeof fetch,
  query?: string,
  category?: string,
  max_price?: number,
): Promise<object> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("category", category);
  if (max_price !== undefined) params.set("max_price", String(max_price));

  const res = await fmcpFetch(`${FOUNDATION_MCP_URL}/catalog?${params}`);
  return res.json();
}

async function serviceDetails(fmcpFetch: typeof fetch, serviceId: string): Promise<object> {
  const res = await fmcpFetch(`${FOUNDATION_MCP_URL}/service/${serviceId}`);
  if (!res.ok) throw new Error(`Service not found: ${serviceId}`);
  return res.json();
}

async function serviceQuote(
  fmcpFetch: typeof fetch,
  serviceId: string,
  args: object,
): Promise<object> {
  const res = await fmcpFetch(`${FOUNDATION_MCP_URL}/service/${serviceId}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return res.json();
}

async function serviceInvoke(
  fetchWithPayment: ReturnType<typeof wrapFetchWithPayment>,
  serviceId: string,
  args: object,
  maxSpend?: number,
): Promise<object> {
  // Check quote against max_spend before paying
  if (maxSpend !== undefined) {
    const quote = (await serviceQuote(fetch, serviceId, args)) as {
      price_hint?: string;
      price_display?: string;
    };
    const priceUnits = Number(quote.price_hint ?? 0);
    const maxUnits = Math.floor(maxSpend * 1_000_000);
    if (priceUnits > maxUnits) {
      throw new Error(
        `Service cost ${quote.price_display} exceeds max_spend of $${maxSpend} USDT0`,
      );
    }
  }

  const res = await fetchWithPayment(`${FOUNDATION_MCP_URL}/service/${serviceId}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Invoke failed (${res.status}): ${body}`);
  }

  const data = await res.json();

  // Include payment info if available
  const paymentHeader = res.headers.get("X-PAYMENT-RESPONSE");
  if (paymentHeader) {
    const payment = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
    return { result: data, payment };
  }

  return { result: data };
}

async function serviceGetReceipt(fmcpFetch: typeof fetch, receiptId: string): Promise<object> {
  const res = await fmcpFetch(`${FOUNDATION_MCP_URL}/receipt/${receiptId}`);
  if (!res.ok) throw new Error(`Receipt not found: ${receiptId}`);
  return res.json();
}

// ── MCP tool definitions ──────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "wallet_status",
    description:
      "Check the agent wallet address and USDT0 balance on Stable mainnet. Call this before starting tasks to confirm available funds.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "catalog_search",
    description:
      "Search available services on the Stable Agentic Platform. Returns a list of services with their IDs, descriptions, categories, and prices.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (matches name and description)" },
        category: {
          type: "string",
          enum: ["llm_inference", "chain_rpc", "paywall", "data"],
          description: "Filter by service category",
        },
        max_price: {
          type: "number",
          description: "Maximum price in USDT0 dollars (e.g. 0.01 = $0.01)",
        },
      },
    },
  },
  {
    name: "service_details",
    description: "Get full details for a specific service by its ID.",
    inputSchema: {
      type: "object",
      required: ["service_id"],
      properties: {
        service_id: { type: "string", description: "The service ID from catalog_search" },
      },
    },
  },
  {
    name: "service_quote",
    description:
      "Get a price quote for a service invocation before paying. Returns price_hint (base units), price_display, and billing_unit.",
    inputSchema: {
      type: "object",
      required: ["service_id"],
      properties: {
        service_id: { type: "string" },
        args: { type: "object", description: "Arguments to pass to the service for quoting" },
      },
    },
  },
  {
    name: "service_invoke",
    description:
      "Invoke a service on the Stable Agentic Platform. Automatically handles x402 payment via the agent wallet. Returns the service result and payment details.",
    inputSchema: {
      type: "object",
      required: ["service_id", "args"],
      properties: {
        service_id: { type: "string", description: "The service ID from catalog_search" },
        args: { type: "object", description: "Arguments to pass to the service" },
        max_spend: {
          type: "number",
          description: "Maximum USDT0 to spend (in dollars). Rejects if quote exceeds this.",
        },
      },
    },
  },
  {
    name: "service_get_receipt",
    description: "Retrieve a payment receipt by payment or receipt ID.",
    inputSchema: {
      type: "object",
      required: ["receipt_id"],
      properties: {
        receipt_id: { type: "string" },
      },
    },
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { account, fetchWithPayment } = initWallet();
  const walletAddress = account.address as `0x${string}`;

  process.stderr.write(`[stable-mcp] Wallet: ${walletAddress}\n`);
  process.stderr.write(`[stable-mcp] Foundation MCP: ${FOUNDATION_MCP_URL}\n`);

  const server = new Server(
    { name: "stable-agentic-platform", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: params = {} } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case "wallet_status": {
          const balance = await getUSDT0Balance(walletAddress);
          result = {
            address: walletAddress,
            network: "Stable mainnet (eip155:988)",
            usdt0_balance: `${balance.display} USDT0`,
            usdt0_raw: balance.raw.toString(),
          };
          break;
        }

        case "catalog_search": {
          const { query, category, max_price } = params as {
            query?: string;
            category?: string;
            max_price?: number;
          };
          result = await catalogSearch(fetch, query, category, max_price);
          break;
        }

        case "service_details": {
          const { service_id } = params as { service_id: string };
          result = await serviceDetails(fetch, service_id);
          break;
        }

        case "service_quote": {
          const { service_id, args = {} } = params as { service_id: string; args?: object };
          result = await serviceQuote(fetch, service_id, args);
          break;
        }

        case "service_invoke": {
          const { service_id, args, max_spend } = params as {
            service_id: string;
            args: object;
            max_spend?: number;
          };
          result = await serviceInvoke(fetchWithPayment, service_id, args, max_spend);
          break;
        }

        case "service_get_receipt": {
          const { receipt_id } = params as { receipt_id: string };
          result = await serviceGetReceipt(fetch, receipt_id);
          break;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[stable-mcp] Fatal: ${err.message}\n`);
  process.exit(1);
});
