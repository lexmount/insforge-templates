/// <reference lib="deno.ns" />

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Expose-Headers': 'X-InsightFlow-Session-Key',
};

type ProxyRequest = {
  insightFlowBaseUrl?: string;
  insightFlowApiKey?: string;
  targetMode?: 'model' | 'agent';
  target?: string;
  message?: string;
  sessionKey?: string;
  disableTools?: boolean;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function isPrivateIPv4(host: string) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function isPrivateIPv6(host: string) {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

function normalizeBaseUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Insight Flow Base URL 无效。');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') throw new Error('Insight Flow Base URL 必须使用 HTTPS。');
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL 不能包含凭据、查询参数或片段。');
  if (host === 'localhost' || host.endsWith('.localhost') || isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new Error('不能访问本地或私有网络地址。');
  }

  const allowedHosts = (Deno.env.get('INSIGHT_FLOW_ALLOWED_HOSTS') ?? '')
    .split(',')
    .map((item: string) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    throw new Error('该 Insight Flow Host 不在服务端允许列表中。');
  }

  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

async function limitedError(response: Response) {
  if (!response.body) return `Insight Flow 返回 ${response.status}`;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let output = '';
  try {
    while (output.length < 2000) {
      const { done, value } = await reader.read();
      if (done) break;
      output += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  try {
    const payload = JSON.parse(output) as { error?: { message?: string } | string; message?: string };
    if (typeof payload.error === 'string') return payload.error;
    return payload.error?.message || payload.message || `Insight Flow 返回 ${response.status}`;
  } catch {
    return output.trim().slice(0, 500) || `Insight Flow 返回 ${response.status}`;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!req.headers.get('Authorization')?.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

  let input: ProxyRequest;
  try {
    input = (await req.json()) as ProxyRequest;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const apiKey = input.insightFlowApiKey?.trim() ?? '';
  const target = input.target?.trim() ?? '';
  const message = input.message?.trim() ?? '';
  if (!apiKey || apiKey.length > 512 || /\s/.test(apiKey)) return json(422, { error: 'invalid_api_key', detail: '请输入有效的 Insight Flow API Key。' });
  if (!target || target.length > 200) return json(422, { error: 'invalid_target', detail: '请输入 Agent Key 或 model。' });
  if (!message || message.length > 32000) return json(422, { error: 'invalid_message', detail: '消息不能为空且不能超过 32,000 字符。' });

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(input.insightFlowBaseUrl?.trim() ?? '');
  } catch (error) {
    return json(422, { error: 'invalid_base_url', detail: error instanceof Error ? error.message : 'Base URL 无效。' });
  }

  const targetMode = input.targetMode === 'agent' ? 'agent' : 'model';
  const requestBody: Record<string, unknown> = {
    stream: true,
    messages: [{ role: 'user', content: message }],
    ...(targetMode === 'agent'
      ? { agent: target }
      : { model: target.includes(':') ? target : `goclaw:${target}` }),
    ...(input.sessionKey?.trim() ? { session_key: input.sessionKey.trim() } : {}),
    ...(input.disableTools ? { tool_choice: 'none' } : {}),
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(requestBody),
      redirect: 'error',
      signal: req.signal,
    });
  } catch (error) {
    if (req.signal.aborted) return json(499, { error: 'client_closed_request' });
    return json(502, { error: 'insight_flow_unreachable', detail: error instanceof Error ? error.message : '无法连接 Insight Flow。' });
  }

  if (!upstream.ok) return json(upstream.status, { error: 'insight_flow_error', detail: await limitedError(upstream) });
  if (!upstream.body) return json(502, { error: 'empty_stream', detail: 'Insight Flow 没有返回响应流。' });
  const contentType = upstream.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    await upstream.body.cancel().catch(() => undefined);
    return json(502, { error: 'unexpected_response', detail: 'Insight Flow 没有返回 SSE。' });
  }

  const sessionKey = upstream.headers.get('X-GoClaw-Session-Key');
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'X-InsForge-Streaming': 'true',
      ...(sessionKey ? { 'X-InsightFlow-Session-Key': sessionKey } : {}),
    },
  });
}
