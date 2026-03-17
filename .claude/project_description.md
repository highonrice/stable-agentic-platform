# Stable Agentic Platform

**TLDR:** Provide an agent compatible interface for x402 guarded resources on the stable blockchain. 

Proposed Demos

**Script \#1**: *Please review article XYZ and then summarize it using the cheapest specialized summary service. You can use the Stable Agentic platform, dont spend more than 1 USDT0*  
AGENT CHAIN OF THOUGHT \+ FLOW

- Agent understands Stable Agentic platform means this local MCP server.  
- Seems it should check the current balance `wallet_status()` before starting.  
- Lists the available services.  
- Tries to fetch article XYZ, website returns that x402 PAYMENT-REQUIRED and the CAIP-2 identifiers say they support Stable chain.  
- Check cost to view the specified article, its 0.25 USDT0, below the current spend below limit, generate signature and retry.  
- Get the article, save it to a temporary file.  
- The user needs me to summarize this, lets see if Stable Agentic platform supports any summary services  
- Get list of services, see that summary services are available. `catalog_search(query, “llm_inference”, max_price?)`  
- They support inference with Opus 4.6, Gemini 3, and Gwen 3.5 397B. Check cost per token for each service with `service_quote(service_id, “Summarize this article…”).`  
- The cheapest offering is Gwen 3.5 397B, it costs 0.000001 USDT0 per token. We have 100 tokens so we are below our spend limit even after the article we bought.  
- Send the article we bought before to the summary service with 0.0001 USDT0 by signing and calling the endpoint: `service_invoke(SERVICE_ID, “Summarize this article…”, 0.0001)`  
- Get the response back, parse it.   
- Provide the summary to the user with the total USDT0 spent. Compute the remaining USDT0 balance.

**Script \#2**: *Please help me figure out how much USDC was transferred out of this wallet XYZ on base. You can use the Stable Agentic platform, dont spend more than 3 USDT0.*  
AGENT CHAIN OF THOUGHT \+ FLOW

- Agent understands Stable Agentic platform means this local MCP server.  
- Seems it should check the current balance `wallet_status()` before starting.  
- Get list of services, see that chain rpc services are available. `catalog_search(query, “chain_rpc”, max_price?)`  
- Sees there is a chain rpc service on the platform.   
- See how much it costs to run our query with `service_quote(service_id, “get_wallet_txns”, “0x123…”)`  
- Ask the user to clarify the token address they care about. \>\> got it.  
- Get the transactions available, `service_invoke(SERVICE_ID, ““get_wallet_txns”, “0x123…”, 0.0001).` It costed us 0.0001 USDT0.  
- Filter through transactions that involved interaction with the USDC token.  
- Filter through transactions that involved funds leaving user XYZ’s wallet.  
- Sum up all the amounts.  
- Provide the total amount the wallet spent with the total USDT0 spent. Compute the remaining USDT0 balance.

Components

- Local Agent integration  
  - Skill \+ context that lets the agent know there is a “Stable Agentic Platform”  
  - Local MCP server that holds the private key, handles signing, and acts as a proxy to the foundation hosted MCP.   
  - Handle generating payment-identifier (idempotency)  
  - The agent interacts with this via stdio.  
  - Claude desktop supports on click install for local extensions and codex supports MCP in both CLI \+ IDE.  
  - Interface  
    - s.wallet\_status() (for local one)  
    - All other endpoints MCP server supports  
- 1x Foundation hosted MCP server  
  - all the agents talk to this server via their local MCP server.   
  - This server interfaces with a whitelisted set of services that follow a standardized interface. It has to list them with payment cost \+ receiver address  
  - Host this at \`[mcp.stable.xyz](http://mcp.stable.xyz)\`  
  - Has usual x402: PAYMENT-REQUIRED with network \+ price \+ payTo.  
  - Interface:  
    - s.catalog\_search(query, category?, max\_price?)  
    - s.service\_details(service\_id)  
    - s.service\_quote(service\_id, args) **PASS THROUGH**  
    - s.service\_invoke(service\_id, args, max\_spend) **SEMI-PASS THROUGH**  
    - s.service\_get\_receipt(payment\_id | receipt\_id) **SEMI-PASS THROUGH**  
    - s.resource\_read(service\_id, uri) **PASS THROUGH**  
- 1x Foundation hosted Facilitator  
  - Does the actual payment attestations onchain, is standardized.  
  - Everyone can use it  
  - Pays for the gas onchain?  
  - Host this at \`facilitator.stable.xyz\`  
- Agentic Services  
  - They whitelist the MCP server hosted by the foundation.  
  - Only allow requests coming from it  
  - Include the receiver of the funds  
  - Follow standardized interface:  
    - s.service\_details() \-\> json  
    - s.quote(args) \-\> {price\_hint, billing\_unit, output\_schmea}  
    - s.invoke(args, max\_spend) \-\> result  
    - s.get\_receipt(payment\_id | receipt\_id) \-\> receipt  
    - s.get\_entitlement(subject) \-\> entitlement  
- Initial Set of offered services  
  - LLM Inference service  
    - Wrap someones claude/codex api key  
  - Bypass paywall on an article  
    - Mock website with paywalled Citrini Research article  
    - Michael can pull it up to show that its pay walled on browser  
  - Chain RPC  
    - Provides standardized calls to different blockchains.  
    - Wrap a quiknode RPC key  
    - Should respond with nicely formatted json that the LLM can read.  
  - Private dataset  
    - Wrap binance data and return historical snapshots of orderbook for BTC.  
    - Can pay for amount of data you buy  
  - Amazon Mechanical Turk Wrapper  
    - Pay someone to do a task for you  
  - Place a bet  
    - Does polymarket betting for you

Why Stable?

- Blocktimes are fast enough that agents can use them naturally, payments settled in about the time it takes for a web request to go through.  
- Cheap, sending funds around costs essentially 0 gas.

Important Considerations & Notes

- Facilitator and MCP need to be high throughput \+ low latency  
- Client side MCP server needs to be super simple to use and secure.  
- Will probably need to publish some sort of unified service interface later on.  
- Does not consider how to do refreshes of available services  
- Does not consider heartbeats etc.
