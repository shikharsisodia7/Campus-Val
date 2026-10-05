/**
 * Minimal Server-Sent Events reader: yields the `data:` payload of each event
 * in a streamed fetch response. Both Gemini (`alt=sse`) and Anthropic stream
 * this way, so neither provider needs an SDK.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = dataOf(event);
        if (data !== null) yield data;
      }
    }
    buffer += decoder.decode();
    const tail = dataOf(buffer.replace(/\r\n/g, "\n"));
    if (tail !== null) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function dataOf(event: string): string | null {
  const lines = event
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""));
  return lines.length > 0 ? lines.join("\n") : null;
}
