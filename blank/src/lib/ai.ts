import { getInsforgeClient } from './insforge'

export type AIMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/** Opt-in helper. Provider credentials stay in the InsForge server runtime. */
export async function chatWithAI(messages: AIMessage[]): Promise<string> {
  const { data, error } = await getInsforgeClient().functions.invoke('ai-chat', { body: { messages } })
  if (error) throw new Error(error.message || 'AI request failed')
  return String((data as { content?: string } | null)?.content ?? '')
}
