---
  Project layout:
  agentic-platform/
  ├── packages/
  │   ├── local-mcp/        # MCP stdio server —
  user installs this in Claude Desktop
  │   ├── foundation-mcp/   # HTTP server — deploy
   to mcp.stable.xyz
  │   └── services/
  │       ├── article/      # Paywalled Citrini
  Research article ($0.25)
  │       ├── llm/          # Claude Haiku
  inference ($0.001/req)
  │       └── chain-rpc/    # Base chain queries
  ($0.0001/req)

  To run locally, fill in these .env files then:

  # Terminal 1 — foundation MCP + all services
  npm run dev

  # Add to Claude Desktop's MCP config:
  # { "stable": { "command": "tsx", "args":
  ["/path/to/packages/local-mcp/src/index.ts"] } }

  Required env values:
  - packages/foundation-mcp/.env → DEFAULT_PAY_TO
  (your USDT0 receiving address)
  - packages/services/llm/.env → ANTHROPIC_API_KEY

  The agent now supports both demo scripts —
  catalog_search finds services, service_quote
  checks costs, service_invoke auto-pays via x402
  on Stable mainnet and proxies to the backend.