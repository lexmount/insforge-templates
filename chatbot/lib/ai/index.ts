import type { AIProvider } from '@/lib/ai/types';

export type { AIProvider, AIChatMessage, UserContentPart, FileParserOptions, StreamCompletionParams } from '@/lib/ai/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createAIProvider(insforgeClient?: any): Promise<AIProvider> {
  if (!insforgeClient) {
    throw new Error('InsForge client is required for AI requests.');
  }
  const { createInsforgeAIProvider } = await import('@/lib/ai/providers/insforge');
  return createInsforgeAIProvider(insforgeClient as Parameters<typeof createInsforgeAIProvider>[0]);
}
