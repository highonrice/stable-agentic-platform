import { config } from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";

config();

const app = express();
app.use(cors());
app.use(express.json());

const BASE_RPC = process.env.BASE_RPC_URL || "https://1rpc.io/base";

// ── Endpoints ──────────────────────────────────────────────────────────────────

app.get("/details", (_req, res) => {
  res.json({
    id: "chain-rpc-base",
    name: "Base Chain RPC",
    description:
      "Ethereum JSON-RPC proxy for Base mainnet. Pass any standard eth_* method and params directly.",
    chain: "base",
    chain_id: 8453,
    rpc_docs: "https://ethereum.org/en/developers/docs/apis/json-rpc/",
    usage: {
      method: "eth_blockNumber | eth_getBalance | eth_getLogs | eth_call | ... (any eth_* method)",
      params: "Array of params exactly as specified in the Ethereum JSON-RPC spec",
    },
    price_display: "$0.0001",
    billing_unit: "per_request",
  });
});

app.post("/quote", (_req, res) => {
  res.json({
    price_hint: "100",
    price_display: "$0.0001",
    billing_unit: "per_request",
    output_schema: { result: "any — standard JSON-RPC result field" },
  });
});

app.post("/invoke", async (req: Request, res: Response) => {
  const { method, params } = req.body as { method?: string; params?: unknown[] };

  if (!method) {
    return res.status(400).json({ error: "method is required" });
  }

  const rpcPayload = {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: params ?? [],
  };

  const upstream = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rpcPayload),
  });

  const json = await upstream.json() as { result?: unknown; error?: unknown };

  if (json.error) {
    return res.status(400).json({ error: json.error });
  }

  res.json(json.result);
});

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`Chain RPC service running on http://localhost:${PORT}`);
});
