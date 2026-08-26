export const OLLAMA_BASE = 'http://localhost:11434';
export const OLLAMA_MODEL = 'qwen2.5:7b';

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string; items?: { type: string } }>;
      required: string[];
    };
  };
}

/**
 * Talks to a local Ollama server. There is no fallback to a cloud API here —
 * if Ollama isn't running, this throws and the caller should surface that
 * plainly rather than silently degrading.
 *
 * Temperature is kept low (rather than Ollama's default 0.8) because this is
 * a tool-calling/planning task, not creative writing — lower temperature
 * trades away variety for more consistently following instructions like
 * "call propose_mods" or "search 2 to 4 times", which is what we want here.
 */
export async function ollamaChat(messages: OllamaMessage[], tools: OllamaToolDefinition[]): Promise<OllamaMessage> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, stream: false, messages, tools, options: { temperature: 0.2 } }),
    });
  } catch {
    throw new Error(`Could not reach Ollama at ${OLLAMA_BASE}. Is "ollama serve" running?`);
  }
  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { message: OllamaMessage };
  return data.message;
}
