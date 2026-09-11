import type { AIProvider } from '@/lib/ai/types';
export type { AIProvider, AIChatMessage, UserContentPart, FileParserOptions, StreamCompletionParams } from '@/lib/ai/types';
export async function createAIProvider(accessToken?: string | null): Promise<AIProvider> {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL;
  if (!baseUrl || !accessToken) throw new Error('An authenticated InsForge session is required.');
  const { createInsforgeAIProvider } = await import('@/lib/ai/providers/insforge');
  return createInsforgeAIProvider({ baseUrl, accessToken });
}
