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

// ── Custom method handlers ─────────────────────────────────────────────────────

type CustomArgs =
  | { method: "get_wallet_txns"; address: string; limit?: number }
  | { method: "get_token_balance"; address: string; token: string }
  | { method: "get_block"; number?: number }
  | { method: "get_eth_balance"; address: string };

async function handleCustom(args: CustomArgs): Promise<object> {
  switch (args.method) {
    case "get_wallet_txns": {
      const address = args.address as Address;
      const limit = args.limit ?? 20;
      const latestBlock = await baseClient.getBlockNumber();
      const fromBlock = latestBlock - 10_000n;
      const transferAbi = parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      );
      const [sentLogs, receivedLogs] = await Promise.all([
        baseClient.getLogs({ event: transferAbi, args: { from: address }, fromBlock, toBlock: latestBlock }),
        baseClient.getLogs({ event: transferAbi, args: { to: address }, fromBlock, toBlock: latestBlock }),
      ]);
      const allLogs = [...sentLogs, ...receivedLogs]
        .sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber))
        .slice(0, limit);
      return {
        wallet: address,
        chain: "base",
        transactions_returned: allLogs.length,
        scanned_blocks: `${fromBlock}-${latestBlock}`,
        transactions: allLogs.map((log) => ({
          block: Number(log.blockNumber),
          tx_hash: log.transactionHash,
          token_contract: log.address,
          from: log.args.from,
          to: log.args.to,
          value_raw: log.args.value?.toString(),
          direction: log.args.from?.toLowerCase() === address.toLowerCase() ? "sent" : "received",
        })),
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
      throw new Error(`Unknown method`);
  }
}

// ── JSON-RPC handler ───────────────────────────────────────────────────────────

type JsonRpcRequest = { method: string; params?: unknown[] };

async function handleJsonRpc(req: JsonRpcRequest): Promise<unknown> {
  const params = req.params ?? [];

  switch (req.method) {
    case "eth_chainId":
      return `0x${base.id.toString(16)}`;

    case "eth_blockNumber": {
      const n = await baseClient.getBlockNumber();
      return `0x${n.toString(16)}`;
    }

    case "eth_gasPrice": {
      const price = await baseClient.getGasPrice();
      return `0x${price.toString(16)}`;
    }

    case "eth_getBalance": {
      const [address, blockTag] = params as [Address, string?];
      const balance = await baseClient.getBalance({ address, blockTag: (blockTag ?? "latest") as never });
      return `0x${balance.toString(16)}`;
    }

    case "eth_getBlockByNumber": {
      const [blockParam, _full] = params as [string, boolean?];
      const block = blockParam === "latest" || blockParam === undefined
        ? await baseClient.getBlock()
        : await baseClient.getBlock({ blockNumber: BigInt(blockParam) });
      return serializeBlock(block);
    }

    case "eth_getBlockByHash": {
      const [blockHash] = params as [`0x${string}`];
      const block = await baseClient.getBlock({ blockHash });
      return serializeBlock(block);
    }

    case "eth_getTransactionByHash": {
      const [hash] = params as [`0x${string}`];
      const tx = await baseClient.getTransaction({ hash });
      return {
        hash: tx.hash,
        blockHash: tx.blockHash,
        blockNumber: tx.blockNumber ? `0x${tx.blockNumber.toString(16)}` : null,
        from: tx.from,
        to: tx.to,
        value: `0x${tx.value.toString(16)}`,
        gas: `0x${tx.gas.toString(16)}`,
        gasPrice: tx.gasPrice ? `0x${tx.gasPrice.toString(16)}` : null,
        nonce: `0x${tx.nonce.toString(16)}`,
        input: tx.input,
        transactionIndex: tx.transactionIndex ? `0x${tx.transactionIndex.toString(16)}` : null,
      };
    }

    case "eth_getTransactionReceipt": {
      const [hash] = params as [`0x${string}`];
      const receipt = await baseClient.getTransactionReceipt({ hash });
      return {
        transactionHash: receipt.transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: `0x${receipt.blockNumber.toString(16)}`,
        from: receipt.from,
        to: receipt.to,
        contractAddress: receipt.contractAddress,
        status: receipt.status === "success" ? "0x1" : "0x0",
        gasUsed: `0x${receipt.gasUsed.toString(16)}`,
        effectiveGasPrice: `0x${receipt.effectiveGasPrice.toString(16)}`,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          topics: log.topics,
          data: log.data,
          blockNumber: `0x${log.blockNumber.toString(16)}`,
          transactionHash: log.transactionHash,
          logIndex: `0x${log.logIndex.toString(16)}`,
        })),
      };
    }

    case "eth_call": {
      const [callParams, blockTag] = params as [{ to: Address; data?: `0x${string}` }, string?];
      const result = await baseClient.call({
        to: callParams.to,
        data: callParams.data,
        blockTag: (blockTag ?? "latest") as never,
      });
      return result.data ?? "0x";
    }

    case "eth_getLogs": {
      const [filter] = params as [{ fromBlock?: string; toBlock?: string; address?: Address; topics?: string[] }];
      const logs = await baseClient.getLogs({
        address: filter.address,
        fromBlock: filter.fromBlock ? BigInt(filter.fromBlock) : undefined,
        toBlock: filter.toBlock ? BigInt(filter.toBlock) : undefined,
      });
      return logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
        blockNumber: `0x${log.blockNumber.toString(16)}`,
        transactionHash: log.transactionHash,
        logIndex: `0x${log.logIndex.toString(16)}`,
        removed: false,
      }));
    }

    default:
      throw new Error(`Unsupported JSON-RPC method: ${req.method}`);
  }
}

function serializeBlock(block: Awaited<ReturnType<typeof baseClient.getBlock>>) {
  return {
    number: block.number ? `0x${block.number.toString(16)}` : null,
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: `0x${block.timestamp.toString(16)}`,
    gasLimit: `0x${block.gasLimit.toString(16)}`,
    gasUsed: `0x${block.gasUsed.toString(16)}`,
    baseFeePerGas: block.baseFeePerGas ? `0x${block.baseFeePerGas.toString(16)}` : null,
    transactions: block.transactions,
    miner: block.miner,
    difficulty: block.difficulty ? `0x${block.difficulty.toString(16)}` : "0x0",
    extraData: block.extraData,
  };
}

// ── Endpoints ──────────────────────────────────────────────────────────────────

const CUSTOM_METHODS = ["get_wallet_txns", "get_token_balance", "get_eth_balance", "get_block"];
const JSON_RPC_METHODS = [
  "eth_chainId", "eth_blockNumber", "eth_gasPrice",
  "eth_getBalance", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getTransactionByHash", "eth_getTransactionReceipt",
  "eth_call", "eth_getLogs",
];

app.get("/details", (_req, res) => {
  res.json({
    id: "chain-rpc-base",
    name: "Base Chain RPC",
    description: "Query Base blockchain using custom methods or standard Ethereum JSON-RPC",
    chain: "base",
    supported_methods: [...CUSTOM_METHODS, ...JSON_RPC_METHODS],
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
  const body = req.body;
  if (!body?.method) {
    return res.status(400).json({ error: "method is required" });
  }

  try {
    let result: unknown;
    if (body.method.startsWith("eth_")) {
      result = await handleJsonRpc(body as JsonRpcRequest);
    } else {
      result = await handleCustom(body as CustomArgs);
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`Chain RPC service running on http://localhost:${PORT}`);
});
