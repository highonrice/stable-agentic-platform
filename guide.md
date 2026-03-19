# Stable Agentic Platform — Local MCP Setup Guide

This guide sets up the local MCP server so Claude Code can discover and pay for services on the Stable Agentic Platform.

---

## Prerequisites

- Node.js 18+
- Claude Code CLI installed

---

## 1. Clone and install

```bash
git clone https://github.com/highonrice/stable-agentic-platform
cd stable-agentic-platform
npm install
```

---

## 2. Initialize your wallet

This generates a private key, saves it to `~/.stable-mcp/wallet.json`, and prints your wallet address.

```bash
npm run init --workspace=packages/local-mcp
```

The output will look like:

```
New wallet created and saved to /Users/<you>/.stable-mcp/wallet.json

Wallet address : 0xABC...
USDT0 balance  : $0.000000

Fund this address with USDT0 on Stable mainnet (chain ID 988).
Bridge at: https://usdt0.to/transfer

⚠  BACK UP YOUR PRIVATE KEY before sending funds:
   0x...
```

**Back up your private key before sending any funds.**

---

## 3. Fund your wallet

Send USDT0 to your wallet address on Stable mainnet (chain ID 988).

- Bridge from other chains: https://usdt0.to/transfer
- USDT0 contract on Stable: `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`

---

## 4. Register the MCP server with Claude Code

Replace `<foundation-mcp-url>` with the deployed Foundation MCP server URL: https://stablefoundation-mcp-production.up.railway.app

**Option A — wallet auto-loaded from `~/.stable-mcp/wallet.json`:**

```bash
claude mcp add stable-agentic-platform \
  "$(pwd)/node_modules/.bin/tsx" \
  "$(pwd)/packages/local-mcp/src/index.ts" \
  -e FOUNDATION_MCP_URL=<foundation-mcp-url> \
  --scope user
```

**Option B — provide your private key explicitly:**

```bash
claude mcp add stable-agentic-platform \
  "$(pwd)/node_modules/.bin/tsx" \
  "$(pwd)/packages/local-mcp/src/index.ts" \
  -e FOUNDATION_MCP_URL=<foundation-mcp-url> \
  -e PRIVATE_KEY=0x... \
  --scope user
```

To update the URL or key later, remove and re-add:

```bash
claude mcp remove stable-agentic-platform
# then re-run the add command above
```

---

## 5. Verify the connection

```bash
claude mcp list
```

You should see:

```
stable-agentic-platform: ... - ✓ Connected
```

If it shows `✗ Failed to connect`, run the server directly to see the error:

```bash
node "$(pwd)/node_modules/.bin/tsx" packages/local-mcp/src/index.ts
```

---

## 6. Use in Claude Code

Restart Claude Code. The following tools are now available automatically:

| Tool | Description |
|---|---|
| `wallet_status` | Check wallet address and USDT0 balance |
| `catalog_search` | Search available services by query, category, or price |
| `service_details` | Get full details for a service by ID |
| `service_quote` | Get a price quote before paying |
| `service_invoke` | Invoke a service (handles x402 payment automatically) |
| `service_get_receipt` | Retrieve a payment receipt |

Example prompts in Claude Code:
- "Check my wallet status"
- "Search for LLM services on the Stable platform"
- "Invoke the article service with max_spend $0.50"

---

## Troubleshooting

**`✗ Failed to connect`**
- Make sure you ran `npm install` from the repo root
- Run the server directly (step 5) to see the exact error

**`Cannot read properties of undefined (reading 'slice')`**
- Your `~/.stable-mcp/wallet.json` is in an old format. Delete it and re-run init:
  ```bash
  rm ~/.stable-mcp/wallet.json
  npm run init --workspace=packages/local-mcp
  ```

**Tools not appearing in Claude Code**
- Restart Claude Code after registering the MCP server
- Confirm the server is connected with `claude mcp list`
