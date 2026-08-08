import OpenAI from "openai";

// This integration is optional (Replit-only internal AI proxy) — a missing
// key must never crash routes unrelated to AI features. The validation
// error is deferred to first actual use via the Proxy below, instead of
// throwing at module load (which used to crash the entire process on any
// request, on any platform where this env var isn't set).
function createClient(): OpenAI {
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_BASE_URL must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY must be set. Did you forget to provision the OpenAI AI integration?",
    );
  }
  return new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
}

let client: OpenAI | null = null;
export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop, _receiver) {
    if (!client) client = createClient();
    return Reflect.get(client as object, prop, client as object);
  },
});
