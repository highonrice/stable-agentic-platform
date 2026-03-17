import { config } from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import {
  createPublicClient,
  http,
  erc20Abi,
  parseAbiItem,
  type Address,
  formatUnits,
} from "viem";
import { base } from "viem/chains";

config();

const app = express();
app.use(cors());
app.use(express.json());

const baseClient = createPublicClient({ chain: base, transport: http() });

// ── Method handlers ───────────────────────────────────────────────────────────

type InvokeArgs =
  | { method: "get_wallet_txns"; address: string; limit?: number }
  | { method: "get_token_balance"; address: string; token: string }
  | { method: "get_block"; number?: number }
  | { method: "get_eth_balance"; address: string };

async function handle(args: InvokeArgs): Promise<object> {
  switch (args.method) {
    case "get_wallet_txns": {
      const address = args.address as Address;
      const limit = args.limit ?? 20;

      // Get ERC-20 Transfer events involving this address (last 1000 blocks)
      const latestBlock = await baseClient.getBlockNumber();
      const fromBlock = latestBlock - 10_000n;

      const transferAbi = parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      );

      const [sentLogs, receivedLogs] = await Promise.all([
        baseClient.getLogs({
          event: transferAbi,
          args: { from: address },
          fromBlock,
          toBlock: latestBlock,
        }),
        baseClient.getLogs({
          event: transferAbi,
          args: { to: address },
          fromBlock,
          toBlock: latestBlock,
        }),
      ]);

      const allLogs = [...sentLogs, ...receivedLogs]
        .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))
        .slice(0, limit);

      const txns = allLogs.map((log) => ({
        block: Number(log.blockNumber),
        tx_hash: log.transactionHash,
        token_contract: log.address,
        from: log.args.from,
        to: log.args.to,
        value_raw: log.args.value?.toString(),
        direction: log.args.from?.toLowerCase() === address.toLowerCase() ? "sent" : "received",
      }));

      return {
        wallet: address,
        chain: "base",
        transactions_returned: txns.length,
        scanned_blocks: `${fromBlock}-${latestBlock}`,
        transactions: txns,
      };
    }

    case "get_token_balance": {
      const address = args.address as Address;
      const token = args.token as Address;

      const [balance, symbol, decimals, name] = await Promise.all([
        baseClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        baseClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
        baseClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
        baseClient.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
      ]);

      return {
        wallet: address,
        chain: "base",
        token: { address: token, name, symbol, decimals },
        balance_raw: balance.toString(),
        balance_formatted: `${formatUnits(balance, decimals)} ${symbol}`,
      };
    }

    case "get_eth_balance": {
      const address = args.address as Address;
      const balance = await baseClient.getBalance({ address });
      return {
        wallet: address,
        chain: "base",
        eth_balance_raw: balance.toString(),
        eth_balance_formatted: `${formatUnits(balance, 18)} ETH`,
      };
    }

    case "get_block": {
      const block = await baseClient.getBlock(
        args.number ? { blockNumber: BigInt(args.number) } : {},
      );
      return {
        chain: "base",
        number: Number(block.number),
        hash: block.hash,
        timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
        transaction_count: block.transactions.length,
        gas_used: block.gasUsed.toString(),
        base_fee_per_gas: block.baseFeePerGas?.toString(),
      };
    }

    default:
      throw new Error(`Unknown method. Supported: get_wallet_txns, get_token_balance, get_eth_balance, get_block`);
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

app.get("/details", (_req, res) => {
  res.json({
    id: "chain-rpc-base",
    name: "Base Chain RPC",
    description: "Query Base blockchain: transactions, balances, blocks",
    chain: "base",
    supported_methods: ["get_wallet_txns", "get_token_balance", "get_eth_balance", "get_block"],
    price_display: "$0.0001",
    billing_unit: "per_request",
  });
});

app.post("/quote", (_req, res) => {
  res.json({
    price_hint: "100",
    price_display: "$0.0001",
    billing_unit: "per_request",
    output_schema: { result: "object" },
  });
});

app.post("/invoke", async (req: Request, res: Response) => {
  const args = req.body as InvokeArgs;
  if (!args?.method) {
    return res.status(400).json({ error: "method is required" });
  }

  const result = await handle(args);
  res.json(result);
});

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`Chain RPC service running on http://localhost:${PORT}`);
});
