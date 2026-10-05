/**
 * The one AI interface the rest of CampusVal depends on. Routes never import a
 * vendor SDK or call a vendor URL — they ask `getAIProvider()` (./index.ts) for
 * whichever SCU-approved provider is configured. See
 * docs/migration/AI_PROVIDER_MIGRATION.md.
 */

export type AIProviderName = "gemini" | "vertex" | "anthropic";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateTextOptions {
  /** Instructions + reference data. Never contains the student's name, IDs or grades (see lib/ai/student-context.ts). */
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
}

export interface SynthesizedSpeech {
  audio: Buffer;
  mimeType: string;
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  /** One complete answer. */
  generateText(opts: GenerateTextOptions): Promise<string>;
  /** The same answer as it is generated, chunk by chunk. */
  streamText(opts: GenerateTextOptions): AsyncIterable<string>;
  /** Speech-to-text. Absent when the provider has no audio input (Anthropic). */
  transcribeAudio?(audio: Buffer, mimeType: string): Promise<string>;
  /** Text-to-speech. Absent when the provider has no audio output (Anthropic). */
  synthesizeSpeech?(text: string): Promise<SynthesizedSpeech>;
}

/** No approved provider is configured: the feature is off, not broken. */
export class AIUnavailableError extends Error {
  constructor(message = "AI features are not configured on this server.") {
    super(message);
    this.name = "AIUnavailableError";
    Object.setPrototypeOf(this, AIUnavailableError.prototype);
  }
}

/**
 * The provider answered with an error or could not be reached. The message is
 * a fixed category plus the HTTP status — never the provider's response body,
 * which can echo the prompt back.
 */
export class AIProviderError extends Error {
  readonly status: number | undefined;
  constructor(provider: AIProviderName, status?: number) {
    super(`${provider} request failed${status ? ` (${status})` : ""}`);
    this.name = "AIProviderError";
    this.status = status;
    Object.setPrototypeOf(this, AIProviderError.prototype);
  }
}

/** The one message a browser ever sees when an AI call fails. */
export const AI_PUBLIC_ERROR_MESSAGE =
  "The AI advisor is temporarily unavailable. Please try again in a moment.";
export const AI_UNAVAILABLE_PUBLIC_MESSAGE = "The AI advisor is not enabled on this server.";

export function publicAIErrorMessage(err: unknown): string {
  return err instanceof AIUnavailableError ? AI_UNAVAILABLE_PUBLIC_MESSAGE : AI_PUBLIC_ERROR_MESSAGE;
}
