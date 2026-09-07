import { createClient } from 'npm:@insforge/sdk'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' },
})
type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'authentication_required' })

  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), edgeFunctionToken: token })
  const { data: identity } = await client.auth.getCurrentUser()
  if (!identity?.user?.id) return json(401, { error: 'authentication_required' })

  let input: { messages?: Message[] }
  try { input = await request.json() } catch { return json(400, { error: 'invalid_json' }) }
  const messages = (input.messages ?? []).slice(0, 30).filter((message) =>
    ['system', 'user', 'assistant'].includes(message.role)
    && typeof message.content === 'string'
    && message.content.length > 0
    && message.content.length <= 20_000
  )
  if (!messages.length || messages.length !== input.messages?.length) return json(422, { error: 'invalid_messages' })

  const model = Deno.env.get('AI_DEFAULT_MODEL')
  if (!model) return json(503, { error: 'ai_not_enabled' })
  try {
    const completion = await client.ai.chat.completions.create({ model, messages, maxTokens: 1200 })
    return json(200, { content: completion.choices?.[0]?.message?.content ?? '' })
  } catch (error) {
    return json(502, { error: 'ai_request_failed', detail: error instanceof Error ? error.message : 'AI request failed' })
  }
}
