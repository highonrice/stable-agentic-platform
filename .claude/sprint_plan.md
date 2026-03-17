# Stable Agentic Platform — 7-Day Demo Sprint

**Goal:** Deliver a live, end-to-end demo of Script #1 (article summarization) and Script #2 (wallet USDC analysis) by Day 7.
**Team:** 2 developers (Dev A, Dev B) with AI-assisted coding.
**Deadline:** 2026-03-24

---

## Scope Decisions (cut for demo)

| In Scope | Out of Scope |
|---|---|
| Local MCP server (wallet + proxy) | `get_entitlement` endpoint |
| Foundation MCP server (core 5 endpoints) | Mechanical Turk service |
| Foundation Facilitator (simplified) | Polymarket service |
| Mock paywall website | Private dataset service |
| LLM Inference service (wrap Claude API) | Service refresh / heartbeats |
| Chain RPC service (wrap QuikNode) | Full error recovery flows |
| Claude Desktop / CLI integration | Multi-wallet support |

**Key simplifications:**
- Facilitator can submit tx and return immediately; no need to wait for deep finality
- Catalog is a hardcoded list for demo (no dynamic registry)
- Auth between Foundation MCP ↔ Services can be a shared secret (not full PKI)

---

## Architecture Assignments

| Component | Owner | Repo/Directory |
|---|---|---|
| Local MCP server | Dev A | `packages/local-mcp` |
| Foundation MCP server | Dev B | `packages/foundation-mcp` |
| Foundation Facilitator | Dev B | `packages/facilitator` |
| Mock paywall site | Dev A | `packages/mock-paywall` |
| LLM Inference service | Dev A | `packages/service-llm` |
| Chain RPC service | Dev B | `packages/service-chain-rpc` |
| Claude skill / context | Dev A | `.claude/` |

---

## Day-by-Day Plan

### Day 1 (2026-03-18) — Repo + Contracts + Skeleton
**Both devs — half day together, half day parallel**

- [ ] Set up monorepo (`pnpm` workspaces or equivalent), shared TypeScript config, linting
- [ ] Define and lock all shared interface types in `packages/shared`:
  - x402 payment-required response shape
  - `CatalogEntry`, `QuoteResponse`, `InvokeResponse`, `Receipt` types
  - MCP tool schemas for all 6 foundation endpoints
- [ ] Decide on Stable chain RPC URL, USDT0 contract address, wallet derivation approach
- [ ] Dev A: scaffold `local-mcp` with stub tools
- [ ] Dev B: scaffold `foundation-mcp` with stub tools + `facilitator` with stub endpoint

**End of Day 1 checkpoint:** Both servers start, types compile, stubs return mock data.

---

### Day 2 (2026-03-19) — Payment Flow Core

**Dev A — Local MCP wallet + signing**
- [ ] Implement `wallet_status()` — read balance from Stable chain
- [ ] Implement x402 intercept: detect `402 Payment Required`, parse `X-Payment-Required` header
- [ ] Implement payment signing: build payment payload, sign with private key
- [ ] Implement retry with `X-Payment` header attached
- [ ] Implement idempotency key generation (UUID per request)
- [ ] Store private key securely (env var + local keyfile, never logged)

**Dev B — Facilitator + Foundation MCP shell**
- [ ] Implement Facilitator `/attest` endpoint:
  - Accept signed payment payload
  - Submit on-chain transfer (USDT0) via Stable chain RPC
  - Return tx hash + receipt
- [ ] Implement `catalog_search` in Foundation MCP — query over hardcoded service list
- [ ] Implement `service_details` in Foundation MCP

**End of Day 2 checkpoint:** Local MCP can sign a payment and Facilitator can submit it on-chain. `wallet_status()` returns a real balance.

---

### Day 3 (2026-03-20) — Services + Mock Paywall

**Dev A — Mock paywall + LLM Inference service**
- [ ] Mock paywall site (simple Express/Next.js app):
  - One article (mock Citrini Research piece)
  - Returns `402 Payment Required` with x402 headers on first request
  - Returns article HTML on valid payment
- [ ] LLM Inference service:
  - `service_details()` → returns model list (Claude Sonnet 4.6, cheapest model as "Gwen")
  - `quote(args)` → estimate tokens, return price in USDT0
  - `invoke(args, max_spend)` → call Claude API (or mock), return completion
  - `get_receipt(payment_id)` → return stored receipt

**Dev B — Chain RPC service + Foundation MCP invoke flow**
- [ ] Chain RPC service:
  - `service_details()` → supported chains/methods
  - `quote(args)` → fixed price per query
  - `invoke("get_wallet_txns", address, max_spend)` → call QuikNode, return normalized JSON
  - `get_receipt(payment_id)` → return stored receipt
- [ ] Foundation MCP `service_quote` — proxy to service, attach pricing metadata
- [ ] Foundation MCP `service_invoke` — proxy to service, trigger payment via Facilitator, return result

**End of Day 3 checkpoint:** Both services respond to `quote` and `invoke` locally. Mock paywall returns article on valid payment header.

---

### Day 4 (2026-03-21) — End-to-End Integration

**Dev A — Local MCP ↔ Foundation MCP wiring**
- [ ] Local MCP proxies all non-wallet tools to Foundation MCP
- [ ] Local MCP attaches signed payment when Foundation MCP returns 402
- [ ] `resource_read` implemented — fetches external URL, handles x402 via local signing
- [ ] Test Script #1 manually end-to-end (article fetch → LLM summarize)

**Dev B — Foundation MCP ↔ Services wiring**
- [ ] Foundation MCP verifies `max_spend` is respected before invoking
- [ ] Foundation MCP logs all payment flows (for demo visibility)
- [ ] Test Script #2 manually end-to-end (chain RPC query → filter → sum USDC)
- [ ] Deploy Foundation MCP + Facilitator to a stable host (Railway, Fly.io, or VPS)

**End of Day 4 checkpoint:** Both scripts run manually with real on-chain payments. Foundation components are deployed.

---

### Day 5 (2026-03-22) — Claude Integration + Claude Desktop

**Dev A — Claude skill + MCP config**
- [ ] Write Claude skill file that explains the Stable Agentic Platform to the agent
- [ ] Write `CLAUDE.md` with instructions for using the local MCP tools
- [ ] Configure `claude_desktop_config.json` (or Claude Code MCP config) to point at local MCP server
- [ ] Run Script #1 with Claude as the agent — fix any tool description / prompt issues
- [ ] Run Script #2 with Claude as the agent — fix any issues

**Dev B — Hardening + logging**
- [ ] Add request/response logging to Foundation MCP (visible during demo)
- [ ] Add spend tracking — Foundation MCP tracks total spent per session
- [ ] Handle edge cases: insufficient balance, max_spend exceeded, service timeout
- [ ] Load test Facilitator with 10 concurrent requests (demo safety check)

**End of Day 5 checkpoint:** Claude can run both scripts end-to-end autonomously with real payments.

---

### Day 6 (2026-03-23) — Demo Polish

**Both devs**
- [ ] Record a dry run of both scripts — note any rough edges
- [ ] Fix any UX/output issues (agent output should be clean and readable)
- [ ] Set up demo environment: funded wallet, deployed services, mock paywall running
- [ ] Write a one-page demo runbook (exact prompts to use, expected outputs, fallback if something breaks)
- [ ] Dev A: package local MCP as a single installable binary or `npx` command
- [ ] Dev B: set up a status page or terminal dashboard showing live payment events (nice to have)

**End of Day 6 checkpoint:** Both demos run cleanly 3 times in a row without intervention.

---

### Day 7 (2026-03-24) — Buffer + Rehearsal

- [ ] Full rehearsal of both demo scripts — treat it like the real presentation
- [ ] Fix any last issues found in rehearsal
- [ ] Ensure wallet has enough USDT0 funded for multiple demo runs
- [ ] Prepare fallback: pre-recorded video of a successful run as backup

---

## Critical Path

The riskiest dependencies in order:

1. **Stable chain payment signing works** (Day 2, Dev A) — everything downstream depends on this
2. **Facilitator submits on-chain tx reliably** (Day 2, Dev B) — needed for any real payment
3. **Foundation MCP invoke + payment flow wired together** (Day 4) — needed for agent demo
4. **Claude reads tool outputs correctly** (Day 5) — LLM behavior is non-deterministic; leave buffer

If Day 2 slips, the whole timeline slips. Prioritize unblocking payment signing above all else.

---

## Open Questions (resolve by Day 1 EOD)

1. Which Stable chain wallet library to use? (ethers.js, viem, or Stable SDK if one exists)
2. Where is the USDT0 contract deployed? What's the transfer method signature?
3. Does the Facilitator actually need to pay gas, or does Stable chain have gas abstraction?
4. QuikNode key — who owns it? Which chains does the RPC service need to support for Script #2?
5. Claude API key for the LLM inference service — whose account?
6. Hosting for Foundation MCP + Facilitator — existing infra or spin up fresh?
