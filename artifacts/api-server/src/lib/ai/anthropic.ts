/**
 * Anthropic Claude via the Messages API (plain REST, no SDK). Text only:
 * Claude has no speech input/output, so the voice feature reports itself
 * unavailable when AI_PROVIDER=anthropic.
 */
import { readSseData } from "./sse";
import { AIProviderError, type AIProvider, type GenerateTextOptions } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 180_000;

interface MessagesResponse {
  content?: { type: string; text?: string }[];
}
interface StreamEvent {
  type?: string;
  delta?: { type?: string; text?: string };
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic" as const;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  private async post(opts: GenerateTextOptions, stream: boolean): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: opts.maxOutputTokens,
          system: opts.system,
          messages: opts.messages,
          stream,
        }),
        signal: AbortSignal.timeout(stream ? STREAM_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AIProviderError(this.name);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new AIProviderError(this.name, res.status);
    }
    return res;
  }

  async generateText(opts: GenerateTextOptions): Promise<string> {
    const json = (await (await this.post(opts, false)).json()) as MessagesResponse;
    return (json.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }

  async *streamText(opts: GenerateTextOptions): AsyncIterable<string> {
    const res = await this.post(opts, true);
    if (!res.body) throw new AIProviderError(this.name);
    for await (const data of readSseData(res.body)) {
      let event: StreamEvent;
      try {
        event = JSON.parse(data) as StreamEvent;
      } catch {
        continue;
      }
      if (event.type === "error") throw new AIProviderError(this.name);
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
        yield event.delta.text;
      }
    }
  }
}
