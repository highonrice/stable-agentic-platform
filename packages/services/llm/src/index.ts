import { config } from "dotenv";
import express, { Request, Response } from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Endpoints ─────────────────────────────────────────────────────────────────

app.get("/details", (_req, res) => {
  res.json({
    id: "llm-claude",
    name: "Claude LLM Inference",
    description: "Run inference with Claude Haiku for summarization, analysis, and Q&A",
    model: "claude-haiku-4-5",
    price_display: "$0.001 per request",
    billing_unit: "per_request",
  });
});

app.post("/quote", (req: Request, res: Response) => {
  const { prompt = "", system = "" } = req.body as { prompt?: string; system?: string };
  const estimatedTokens = Math.ceil((prompt.length + system.length) / 4);
  res.json({
    price_hint: "1000",
    price_display: "$0.001",
    billing_unit: "per_request",
    estimated_input_tokens: estimatedTokens,
    output_schema: { content: "string", usage: { input_tokens: "number", output_tokens: "number" } },
  });
});

app.post("/invoke", async (req: Request, res: Response) => {
  const { prompt, system, max_tokens = 1024 } = req.body as {
    prompt: string;
    system?: string;
    max_tokens?: number;
  };

  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens,
    ...(system && { system }),
    messages,
  });

  const textContent = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  res.json({
    content: textContent,
    model: response.model,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
    stop_reason: response.stop_reason,
  });
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`LLM service running on http://localhost:${PORT}`);
});
