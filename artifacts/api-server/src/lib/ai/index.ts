/**
 * Selects CampusVal's AI provider from the environment.
 *
 *   AI_PROVIDER=gemini     GEMINI_API_KEY (+ GEMINI_MODEL)
 *   AI_PROVIDER=vertex     GOOGLE_CLOUD_PROJECT (+ VERTEX_LOCATION, GEMINI_MODEL);
 *                          credentials = the runtime service account (ADC)
 *   AI_PROVIDER=anthropic  ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL)
 *
 * There is deliberately NO OpenAI option and NO fallback chain: an unset or
 * unrecognised AI_PROVIDER turns AI features off (AIUnavailableError), it never
 * silently routes student questions to a different vendor.
 */
import { AnthropicProvider } from "./anthropic";
import { apiKeyTransport, GeminiProvider, vertexTransport } from "./gemini";
import { AIUnavailableError, type AIProvider, type AIProviderName } from "./types";

export * from "./types";

type Env = Record<string, string | undefined>;

export const AI_DEFAULTS = {
  geminiModel: "gemini-2.5-flash",
  geminiTtsModel: "gemini-2.5-flash-preview-tts",
  geminiTtsVoice: "Kore",
  vertexLocation: "us-central1",
  anthropicModel: "claude-sonnet-5-5",
} as const;

const val = (env: Env, name: string): string | undefined => {
  const v = env[name]?.trim();
  return v ? v : undefined;
};

export function resolveAIProviderName(env: Env = process.env): AIProviderName | null {
  const raw = val(env, "AI_PROVIDER")?.toLowerCase();
  return raw === "gemini" || raw === "vertex" || raw === "anthropic" ? raw : null;
}

/** Variable names (never values) the selected provider is missing. */
export function missingAIConfig(env: Env = process.env): string[] {
  switch (resolveAIProviderName(env)) {
    case "gemini":
      return val(env, "GEMINI_API_KEY") ? [] : ["GEMINI_API_KEY"];
    case "vertex":
      return val(env, "GOOGLE_CLOUD_PROJECT") ? [] : ["GOOGLE_CLOUD_PROJECT"];
    case "anthropic":
      return val(env, "ANTHROPIC_API_KEY") ? [] : ["ANTHROPIC_API_KEY"];
    default:
      return [];
  }
}

export function createAIProvider(env: Env = process.env): AIProvider {
  const name = resolveAIProviderName(env);
  if (!name || missingAIConfig(env).length > 0) throw new AIUnavailableError();
  const geminiModel = val(env, "GEMINI_MODEL") ?? AI_DEFAULTS.geminiModel;
  const ttsModel = val(env, "GEMINI_TTS_MODEL") ?? AI_DEFAULTS.geminiTtsModel;
  const ttsVoice = val(env, "GEMINI_TTS_VOICE") ?? AI_DEFAULTS.geminiTtsVoice;
  switch (name) {
    case "gemini":
      return new GeminiProvider(apiKeyTransport(val(env, "GEMINI_API_KEY")!), geminiModel, ttsModel, ttsVoice);
    case "vertex":
      return new GeminiProvider(
        vertexTransport(val(env, "GOOGLE_CLOUD_PROJECT")!, val(env, "VERTEX_LOCATION") ?? AI_DEFAULTS.vertexLocation),
        geminiModel,
        ttsModel,
        ttsVoice,
      );
    case "anthropic":
      return new AnthropicProvider(val(env, "ANTHROPIC_API_KEY")!, val(env, "ANTHROPIC_MODEL") ?? AI_DEFAULTS.anthropicModel);
  }
}

let cached: AIProvider | null = null;
let override: AIProvider | null = null;

/** The configured provider. Throws AIUnavailableError when AI is off. */
export function getAIProvider(): AIProvider {
  if (override) return override;
  cached ??= createAIProvider();
  return cached;
}

/** Test seam: inject a fake provider (or null to restore env-based selection). */
export function setAIProviderForTests(provider: AIProvider | null): void {
  override = provider;
  cached = null;
}
