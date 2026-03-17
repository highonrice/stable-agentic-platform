export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  category: "llm_inference" | "chain_rpc" | "paywall" | "data";
  endpoint: string;
  payTo: string;
  /** USDT0 amount in base units (6 decimals). e.g. "1000" = $0.001 */
  price: string;
  priceDisplay: string;
  billingUnit: "per_request" | "per_token";
}

function payTo(envKey: string): string {
  const addr = process.env[envKey] || process.env.DEFAULT_PAY_TO;
  if (!addr) throw new Error(`Missing ${envKey} or DEFAULT_PAY_TO in environment`);
  return addr;
}

export function buildRegistry(): ServiceDefinition[] {
  return [
    {
      id: "article-citrini",
      name: "Citrini Research Article",
      description:
        "Access a paywalled Citrini Research macro analysis article on global liquidity cycles",
      category: "paywall",
      endpoint: process.env.ARTICLE_SERVICE_URL || "http://localhost:5001",
      payTo: payTo("ARTICLE_PAY_TO"),
      price: "250000", // $0.25
      priceDisplay: "$0.25",
      billingUnit: "per_request",
    },
    {
      id: "llm-claude",
      name: "Claude LLM Inference",
      description:
        "Run inference with Claude Haiku for summarization, analysis, and Q&A tasks",
      category: "llm_inference",
      endpoint: process.env.LLM_SERVICE_URL || "http://localhost:5002",
      payTo: payTo("LLM_PAY_TO"),
      price: "1000", // $0.001
      priceDisplay: "$0.001",
      billingUnit: "per_request",
    },
    {
      id: "chain-rpc-base",
      name: "Base Chain RPC",
      description:
        "Query Base blockchain: wallet transaction history, token balances, block data",
      category: "chain_rpc",
      endpoint: process.env.CHAIN_RPC_SERVICE_URL || "http://localhost:5003",
      payTo: payTo("CHAIN_RPC_PAY_TO"),
      price: "100", // $0.0001
      priceDisplay: "$0.0001",
      billingUnit: "per_request",
    },
  ];
}
