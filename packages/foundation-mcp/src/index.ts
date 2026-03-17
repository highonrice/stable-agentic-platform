import { config } from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { buildRegistry, type ServiceDefinition } from "./registry.js";

config();

// ── Config ────────────────────────────────────────────────────────────────────

const STABLE_NETWORK = "eip155:988";
const USDT0_STABLE = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://x402.semanticpay.io/";
const PORT = Number(process.env.PORT || 3001);

const services = buildRegistry();
const serviceMap = new Map(services.map((s) => [s.id, s]));

// ── x402 setup ────────────────────────────────────────────────────────────────

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

// Build x402 route config from service registry
const paymentRoutes: Record<string, object> = {};
for (const svc of services) {
  paymentRoutes[`POST /service/${svc.id}/invoke`] = {
    accepts: [
      {
        scheme: "exact",
        network: STABLE_NETWORK,
        price: {
          amount: svc.price,
          asset: USDT0_STABLE,
          extra: { name: "USDT0", version: "1", decimals: 6 },
        },
        payTo: svc.payTo,
      },
    ],
    description: svc.description,
    mimeType: "application/json",
  };
}

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  STABLE_NETWORK,
  new ExactEvmScheme(),
);

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// x402 middleware must come before route handlers for paid routes
app.use(paymentMiddleware(paymentRoutes, resourceServer));

// ── Free endpoints ────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    network: STABLE_NETWORK,
    facilitator: FACILITATOR_URL,
    services: services.map((s) => ({ id: s.id, name: s.name, price: s.priceDisplay })),
  });
});

app.get("/catalog", (req, res) => {
  const { q, category, max_price } = req.query as Record<string, string>;
  let results: ServiceDefinition[] = [...services];

  if (q) {
    const lq = q.toLowerCase();
    results = results.filter(
      (s) => s.name.toLowerCase().includes(lq) || s.description.toLowerCase().includes(lq),
    );
  }
  if (category) {
    results = results.filter((s) => s.category === category);
  }
  if (max_price) {
    // max_price in USDT0 dollars (e.g. "0.01")
    const maxUnits = Math.floor(parseFloat(max_price) * 1_000_000);
    results = results.filter((s) => Number(s.price) <= maxUnits);
  }

  res.json({ services: results });
});

app.get("/service/:id", (req, res) => {
  const svc = serviceMap.get(req.params.id);
  if (!svc) return res.status(404).json({ error: "Service not found" });
  res.json(svc);
});

// Quote: free pass-through to service backend
app.post("/service/:id/quote", async (req: Request, res: Response) => {
  const svc = serviceMap.get(req.params.id);
  if (!svc) return res.status(404).json({ error: "Service not found" });

  try {
    const upstream = await fetch(`${svc.endpoint}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.json(data);
  } catch {
    // Fallback: return static price info from registry
    res.json({
      price_hint: svc.price,
      price_display: svc.priceDisplay,
      billing_unit: svc.billingUnit,
      output_schema: {},
    });
  }
});

// Invoke: x402-gated by paymentMiddleware; proxies to service backend after payment
app.post("/service/:id/invoke", async (req: Request, res: Response) => {
  const svc = serviceMap.get(req.params.id);
  if (!svc) return res.status(404).json({ error: "Service not found" });

  try {
    const upstream = await fetch(`${svc.endpoint}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(502).json({ error: "Service error", detail: err });
    }

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Service unavailable", detail: String(err) });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Foundation MCP server running on http://localhost:${PORT}`);
  console.log(`Network: ${STABLE_NETWORK} | Facilitator: ${FACILITATOR_URL}`);
  console.log(`Services: ${services.map((s) => `${s.id} (${s.priceDisplay})`).join(", ")}`);
});
