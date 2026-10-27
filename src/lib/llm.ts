/* ------------------------------------------------------------------ *
 * LLM provider abstraction.
 * Uses a real model when a key is present in the environment; otherwise
 * reports a local heuristic engine so the council always has a reasoner.
 * Keys are read server-side only — never exposed to the client.
 * ------------------------------------------------------------------ */

export interface EngineInfo {
  kind: "llm" | "local";
  provider: string;
  model: string;
}

interface Provider {
  provider: string;
  model: string;
  key: string;
  url: string;
  kind: "openai" | "anthropic" | "gemini";
}

function pickProvider(): Provider | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey)
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      key: openaiKey,
      url: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      kind: "openai",
    };

  const groq = process.env.GROQ_API_KEY;
  if (groq)
    return {
      provider: "groq",
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      key: groq,
      url: "https://api.groq.com/openai/v1",
      kind: "openai",
    };

  const openrouter = process.env.OPENROUTER_API_KEY;
  if (openrouter)
    return {
      provider: "openrouter",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
      key: openrouter,
      url: "https://openrouter.ai/api/v1",
      kind: "openai",
    };

  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (anthropic)
    return {
      provider: "anthropic",
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
      key: anthropic,
      url: "https://api.anthropic.com/v1",
      kind: "anthropic",
    };

  const gemini = process.env.GEMINI_API_KEY;
  if (gemini)
    return {
      provider: "gemini",
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      key: gemini,
      url: "https://generativelanguage.googleapis.com/v1beta",
      kind: "gemini",
    };

  return null;
}

export function getEngine(): EngineInfo {
  const p = pickProvider();
  if (!p) return { kind: "local", provider: "heuristic", model: "orch-local-3.1" };
  return { kind: "llm", provider: p.provider, model: p.model };
}

export const ENGINE = getEngine();

export interface CompletionResult {
  text: string;
  ms: number;
}

/**
 * Single-turn completion. Throws when no provider is configured or the call
 * fails — callers are expected to fall back to their local narrative.
 */
export async function complete(
  system: string,
  user: string,
  maxTokens = 320,
): Promise<CompletionResult> {
  const p = pickProvider();
  if (!p) throw new Error("no provider configured");
  const started = Date.now();
  const signal = AbortSignal.timeout(18000);

  let text = "";

  if (p.kind === "anthropic") {
    const res = await fetch(`${p.url}/messages`, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": p.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: p.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const json = await res.json();
    text = json?.content?.[0]?.text ?? "";
  } else if (p.kind === "gemini") {
    const res = await fetch(
      `${p.url}/models/${p.model}:generateContent?key=${encodeURIComponent(p.key)}`,
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const json = await res.json();
    text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } else {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${p.key}`,
    };
    if (p.provider === "openrouter") {
      headers["http-referer"] = "https://orchestra.local";
      headers["x-title"] = "Orchestra Career Council";
    }
    const res = await fetch(`${p.url}/chat/completions`, {
      method: "POST",
      signal,
      headers,
      body: JSON.stringify({
        model: p.model,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai-compatible ${res.status}`);
    const json = await res.json();
    text = json?.choices?.[0]?.message?.content ?? "";
  }

  const cleaned = text.trim();
  if (!cleaned) throw new Error("empty completion");
  return { text: cleaned, ms: Date.now() - started };
}
