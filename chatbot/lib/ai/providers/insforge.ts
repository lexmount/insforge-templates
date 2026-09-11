import type { AIProvider, StreamCompletionParams } from '@/lib/ai/types';
import { CreditsError, responseError } from '@/lib/credits-client';

/** Uses only the application's managed gateway. Preserves errors the legacy SDK drops. */
export function createInsforgeAIProvider(config: { baseUrl: string; accessToken: string }, fetcher: typeof fetch = fetch): AIProvider {
  return {
    async streamCompletion(params: StreamCompletionParams) {
      const response = await fetcher(`${config.baseUrl.replace(/\/$/, '')}/api/ai/chat/completion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: params.messages, ...(params.model ? { model: params.model } : {}), ...(params.fileParser ? { fileParser: params.fileParser } : {}), stream: true }),
        cache: 'no-store',
      });
      if (!response.ok) throw await responseError(response);
      if (!response.body) throw new Error('The model gateway returned no stream.');
      return {
        async *[Symbol.asyncIterator]() {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let completed = false;
          function parse(line: string): string | null {
            if (!line.startsWith('data:')) return null;
            const payload = line.slice(5).trim();
            if (!payload) return null;
            const event = JSON.parse(payload);
            if (event.error) throw new CreditsError(event.code ?? event.error?.code ?? 'AI_REQUEST_FAILED', event.message ?? event.error?.message ?? 'The AI request failed.', 502);
            if (event.done) completed = true;
            return typeof event.chunk === 'string' ? event.chunk : typeof event.content === 'string' ? event.content : null;
          }
          try {
            while (!completed) {
              const { done, value } = await reader.read();
              buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const line of lines) { const text = parse(line); if (text) yield text; }
              if (done) {
                if (buffer.trim()) { const text = parse(buffer); if (text) yield text; }
                break;
              }
            }
            if (!completed) throw new Error('The model stream ended before completion. Please check your bill before retrying.');
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
        },
      };
    },
  };
}
