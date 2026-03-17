import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ── Mock Citrini Research article ─────────────────────────────────────────────

const ARTICLE = {
  id: "citrini-2025-global-liquidity",
  title: "Global Liquidity Cycles and the Dollar Endgame",
  author: "Citrini Research",
  published: "2025-11-15",
  content: `
# Global Liquidity Cycles and the Dollar Endgame

## Executive Summary

The global financial system is experiencing a structural shift in liquidity dynamics that has profound implications for asset prices across all classes. Our analysis of M2 aggregates across G7 economies, combined with Fed balance sheet trajectory modeling, suggests we are entering a regime change that will define the next decade of investing.

## Global M2 Dynamics

Aggregate G7 M2 growth decelerated sharply from its post-pandemic peak of +18.3% YoY in Q3 2021 to -1.2% YoY in Q4 2023. However, a critical divergence has emerged: while the Fed has conducted the most aggressive QT in modern history, the PBOC and BOJ have expanded their balance sheets by $2.1T and $0.8T respectively.

This creates what we term the "liquidity seesaw" — dollar tightening offset by yen and renminbi expansion, keeping global risk assets supported even as US credit conditions tighten.

## The Dollar Endgame

The US dollar index (DXY) has maintained an inverse relationship with global risk appetite with a 0.87 correlation coefficient over the past decade. Our proprietary Global Liquidity Index (GLI) — a weighted composite of G7 central bank balance sheets, Eurodollar market depth, and cross-border lending flows — suggests:

1. **Short-term (6-12 months):** GLI expected to bottom in Q2 2025, with subsequent expansion driven by Fed pivot + continued EM central bank easing
2. **Medium-term (12-36 months):** Dollar weakness of 8-15% from current levels as real rate differentials compress
3. **Long-term (3-10 years):** Structural demand destruction for dollar-denominated reserve assets as BRICS+ settlement infrastructure matures

## Asset Class Implications

**Equities:** GLI turning points historically lead S&P 500 inflection points by 6-9 months with 78% reliability. Current setup resembles late 2015 pre-melt-up configuration.

**Fixed Income:** 10Y Treasury yield target of 3.8-4.2% by year-end, with curve steepening bias as front-end rates fall faster than long end.

**Commodities:** Gold remains the cleanest expression of dollar debasement thesis. Target: $3,200-3,500 within 18 months. Oil structurally constrained by energy transition capex underspend.

**Digital Assets:** Bitcoin's correlation with Global M2 (lagged 12 weeks) has increased to 0.91 in 2024. Expect BTC to lead the next risk-on cycle by approximately 60-90 days.

## Risk Factors

- Fed re-acceleration of rate hikes due to wage-driven inflation resurgence
- Chinese property sector systemic failure overwhelming PBOC stimulus capacity
- Geopolitical shock triggering dollar flight-to-safety bid
- Eurozone fragmentation risk resurfacing under fiscal stress

## Conclusion

The weight of evidence suggests a global liquidity expansion cycle beginning in H2 2025, with magnitude dependent on the synchronization of major central bank pivots. Position accordingly: overweight risk assets, duration, and hard assets; underweight cash and short-duration credit.

*Citrini Research. For institutional clients only. Not investment advice.*
  `.trim(),
  word_count: 487,
};

// ── Endpoints ─────────────────────────────────────────────────────────────────

app.get("/details", (_req, res) => {
  res.json({
    id: "article-citrini",
    name: "Citrini Research Article",
    description: "Access a paywalled Citrini Research macro analysis article",
    price_display: "$0.25",
    billing_unit: "per_request",
  });
});

app.post("/quote", (_req, res) => {
  res.json({
    price_hint: "250000",
    price_display: "$0.25",
    billing_unit: "per_request",
    output_schema: { title: "string", author: "string", content: "string", word_count: "number" },
  });
});

app.post("/invoke", (_req, res) => {
  res.json(ARTICLE);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Article service running on http://localhost:${PORT}`);
});
