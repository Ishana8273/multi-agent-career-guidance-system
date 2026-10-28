
/* ------------------------------------------------------------------
 * LLM provider abstraction for ORCHESTRA.
 *
 * Supported providers:
 *   1. OpenAI
 *   2. Groq
 *   3. OpenRouter
 *   4. Anthropic
 *   5. Gemini
 *
 * API keys remain server-side.
 * When no key is configured, the application uses its local engine.
 * ------------------------------------------------------------------ */

export interface EngineInfo {
  kind: "llm" | "local";
  provider: string;
  model: string;
}

type ProviderKind = "openai" | "anthropic" | "gemini";

interface Provider {
  provider: string;
  model: string;
  key: string;
  url: string;
  kind: ProviderKind;
}

export interface CompletionResult {
  text: string;
  ms: number;
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function pickProvider(): Provider | null {
  // Provider priority: OpenAI > Groq > OpenRouter > Anthropic > Gemini.

  const openaiKey = getEnv("OPENAI_API_KEY");

  if (openaiKey) {
    return {
      provider: "openai",
      model: getEnv("OPENAI_MODEL") || "gpt-4o-mini",
      key: openaiKey,
      url: (
        getEnv("OPENAI_BASE_URL") ||
        "https://api.openai.com/v1"
      ).replace(/\/+$/, ""),
      kind: "openai",
    };
  }

  const groqKey = getEnv("GROQ_API_KEY");

  if (groqKey) {
    return {
      provider: "groq",
      model: getEnv("GROQ_MODEL") || "openai/gpt-oss-20b",
      key: groqKey,
      url: "https://api.groq.com/openai/v1",
      kind: "openai",
    };
  }

  const openrouterKey = getEnv("OPENROUTER_API_KEY");

  if (openrouterKey) {
    return {
      provider: "openrouter",
      model:
        getEnv("OPENROUTER_MODEL") || "openai/gpt-4o-mini",
      key: openrouterKey,
      url: "https://openrouter.ai/api/v1",
      kind: "openai",
    };
  }

  const anthropicKey = getEnv("ANTHROPIC_API_KEY");

  if (anthropicKey) {
    return {
      provider: "anthropic",
      model:
        getEnv("ANTHROPIC_MODEL") || "claude-3-5-haiku-latest",
      key: anthropicKey,
      url: "https://api.anthropic.com/v1",
      kind: "anthropic",
    };
  }

  const geminiKey = getEnv("GEMINI_API_KEY");

  if (geminiKey) {
    return {
      provider: "gemini",
      model: getEnv("GEMINI_MODEL") || "gemini-2.0-flash",
      key: geminiKey,
      url: "https://generativelanguage.googleapis.com/v1beta",
      kind: "gemini",
    };
  }

  return null;
}

export function getEngine(): EngineInfo {
  const provider = pickProvider();

  if (!provider) {
    return {
      kind: "local",
      provider: "heuristic",
      model: "orch-local-3.1",
    };
  }

  return {
    kind: "llm",
    provider: provider.provider,
    model: provider.model,
  };
}

// Retains compatibility with existing imports in agents.ts.
export const ENGINE = getEngine();

/**
 * Read an API error response without exposing API keys.
 */
async function readApiError(
  response: Response,
  provider: string,
): Promise<Error> {
  let details = "";

  try {
    details = await response.text();
  } catch {
    details = "The response body could not be read.";
  }

  // Keep terminal logs readable.
  details = details.slice(0, 1500);

  return new Error(
    `${provider} API request failed ` +
      `(HTTP ${response.status} ${response.statusText}). ` +
      `Details: ${details || "No error details returned."}`,
  );
}

/**
 * Makes an HTTP request with a timeout.
 */
async function requestJson(
  url: string,
  init: RequestInit,
  provider: string,
): Promise<any> {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(18000),
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `${provider} request failed: ${error.message}`,
      );
    }

    throw new Error(`${provider} request failed unexpectedly.`);
  }

  if (!response.ok) {
    throw await readApiError(response, provider);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(
      `${provider} returned an invalid JSON response.`,
    );
  }
}

/**
 * Extract text from a compatible chat completion.
 */
function extractMessageText(message: any): string {
  const content = message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (part: any) =>
          typeof part?.text === "string",
      )
      .map((part: any) => part.text)
      .join("\n");
  }

  return "";
}

/**
 * Generates a single response using the configured provider.
 *
 * Throws a descriptive error when the provider request fails.
 * Existing callers can catch the error and use their local fallback.
 */
export async function complete(
  system: string,
  user: string,
  maxTokens = 320,
): Promise<CompletionResult> {
  const provider = pickProvider();

  if (!provider) {
    throw new Error(
      "No LLM provider configured. Set an API key in .env.local.",
    );
  }

  const started = Date.now();
  let generatedText = "";

  if (provider.kind === "anthropic") {
    const result = await requestJson(
      `${provider.url}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": provider.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: maxTokens,
          system,
          messages: [
            {
              role: "user",
              content: user,
            },
          ],
        }),
      },
      provider.provider,
    );

    generatedText = Array.isArray(result?.content)
      ? result.content
          .filter(
            (part: any) =>
              part?.type === "text" &&
              typeof part?.text === "string",
          )
          .map((part: any) => part.text)
          .join("\n")
      : "";
  } else if (provider.kind === "gemini") {
    const url =
      `${provider.url}/models/` +
      `${encodeURIComponent(provider.model)}:generateContent` +
      `?key=${encodeURIComponent(provider.key)}`;

    const result = await requestJson(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: system }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: user }],
            },
          ],
          generationConfig: {
            maxOutputTokens: maxTokens,
          },
        }),
      },
      provider.provider,
    );

    generatedText = (
      result?.candidates?.[0]?.content?.parts ?? []
    )
      .filter(
        (part: any) => typeof part?.text === "string",
      )
      .map((part: any) => part.text)
      .join("\n");

    if (!generatedText.trim()) {
      const finishReason =
        result?.candidates?.[0]?.finishReason ?? "unknown";

      throw new Error(
        `Gemini returned no text. Finish reason: ${finishReason}.`,
      );
    }
  } else {
    // OpenAI, Groq and OpenRouter use the compatible chat API.
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${provider.key}`,
    };

    if (provider.provider === "openrouter") {
      headers["http-referer"] = "https://orchestra.local";
      headers["x-title"] = "Orchestra Career Council";
    }

    const isGroqGptOss =
      provider.provider === "groq" &&
      /^openai\/gpt-oss-(20b|120b)$/i.test(provider.model);

    // GPT-OSS needs room for reasoning and its final answer.
    // Keep other providers' existing token settings unchanged.
    const tokenOptions = isGroqGptOss
      ? {
          max_completion_tokens: Math.max(maxTokens, 2048),
          reasoning_effort: "low",
          include_reasoning: false,
        }
      : {
          max_tokens: maxTokens,
        };

    const result = await requestJson(
      `${provider.url}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: provider.model,
          ...tokenOptions,
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: system,
            },
            {
              role: "user",
              content: user,
            },
          ],
        }),
      },
      provider.provider,
    );

    const choice = result?.choices?.[0];
    const message = choice?.message;

    generatedText = extractMessageText(message);

    if (!generatedText.trim()) {
      const finishReason =
        choice?.finish_reason ?? "unknown";

      const completionTokens =
        result?.usage?.completion_tokens ?? "unknown";

      // Log metadata only: no API key, prompt, or reasoning text.
      console.error(
        `[${provider.provider}] Empty final answer. ` +
          `model=${provider.model}, ` +
          `finish_reason=${finishReason}, ` +
          `completion_tokens=${completionTokens}`,
      );

      throw new Error(
        `${provider.provider} returned no final answer. ` +
          `finish_reason=${finishReason}; ` +
          `completion_tokens=${completionTokens}.`,
      );
    }
  }

  if (typeof generatedText !== "string") {
    throw new Error(
      `${provider.provider} returned an unexpected response format.`,
    );
  }

  const cleaned = generatedText.trim();

  if (!cleaned) {
    throw new Error(
      `${provider.provider} returned an empty completion.`,
    );
  }

  return {
    text: cleaned,
    ms: Date.now() - started,
  };
}
