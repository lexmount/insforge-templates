/// <reference lib="deno.ns" />

import { createClient } from 'npm:@insforge/sdk@1.5.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Expose-Headers': 'X-InsightFlow-Session-Key',
};

type ProxyRequest = { message?: string; sessionKey?: string };
export type StoredConfig = {
  base_url: string;
  target_mode: 'model' | 'agent';
  target: string;
  disable_tools: boolean;
  api_key: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

async function limitedError(response: Response) {
  const text = (await response.text()).slice(0, 2000);
  try {
    const payload = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof payload.error === 'string') return payload.error;
    return payload.error?.message || payload.message ||
      `Insight Flow 返回 ${response.status}`;
  } catch {
    return text.trim().slice(0, 500) || `Insight Flow 返回 ${response.status}`;
  }
}

function ipv4Parts(value: string) {
  const parts = value.split('.').map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function embeddedIPv4(value: string) {
  const dotted = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (dotted) return ipv4Parts(dotted[1]);
  const hex = /^::(?:(?:ffff:)(?:0:)?)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(value);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isNonPublicIPv4(parts: number[] | null) {
  if (!parts) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

export function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, '');
  const privateIPv6 = bare === '::' || bare === '::1' || bare.startsWith('fc') || bare.startsWith('fd') ||
    /^fe[89a-f]/.test(bare);
  return host === 'localhost' || host.endsWith('.localhost') || privateIPv6 ||
    isNonPublicIPv4(ipv4Parts(host)) || isNonPublicIPv4(embeddedIPv4(bare));
}

function safeBaseUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('invalid_base_url');
  }
  const host = url.hostname.toLowerCase();
  if (isBlockedHostname(host)) throw new Error('private_base_url');
  const allowedHosts = (Deno.env.get('INSIGHT_FLOW_ALLOWED_HOSTS') ?? '')
    .split(',')
    .map((item: string) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    throw new Error('host_not_allowed');
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'AUTH_UNAUTHORIZED' });
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    accessToken: token,
  });
  const { data: identity } = await client.auth.getCurrentUser();
  if (!identity?.user?.id) return json(401, { error: 'AUTH_UNAUTHORIZED' });

  let input: ProxyRequest;
  try {
    input = (await req.json()) as ProxyRequest;
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const message = input.message?.trim() ?? '';
  if (!message || message.length > 32000) {
    return json(422, { error: 'invalid_message' });
  }

  const { data, error } = await client.database
    .from('insight_flow_agent_configs')
    .select('base_url,target_mode,target,disable_tools,api_key')
    .maybeSingle();
  if (error) {
    return json(500, { error: 'config_read_failed', detail: error.message });
  }
  if (!data) return json(409, { error: 'agent_not_configured' });
  const config = data as StoredConfig;
  if (!config.target.trim() || config.target.length > 200) {
    return json(422, { error: 'invalid_stored_target' });
  }

  let baseUrl: string;
  try {
    baseUrl = safeBaseUrl(config.base_url);
  } catch {
    return json(422, { error: 'invalid_stored_base_url' });
  }

  const apiKey = config.api_key.trim();
  if (!apiKey || apiKey.length > 512 || /\s/.test(apiKey)) {
    return json(422, { error: 'invalid_stored_api_key' });
  }

  const requestBody: Record<string, unknown> = {
    stream: true,
    messages: [{ role: 'user', content: message }],
    ...(config.target_mode === 'agent' ? { agent: config.target } : {
      model: config.target.includes(':') ? config.target : `goclaw:${config.target}`,
    }),
    ...(input.sessionKey?.trim() ? { session_key: input.sessionKey.trim() } : {}),
    ...(config.disable_tools ? { tool_choice: 'none' } : {}),
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
  } catch (reason) {
    if (req.signal.aborted) {
      return json(499, { error: 'client_closed_request' });
    }
    return json(502, {
      error: 'insight_flow_unreachable',
      detail: reason instanceof Error ? reason.message : '无法连接 Insight Flow。',
    });
  }

  if (!upstream.ok) {
    return json(502, {
      error: 'insight_flow_error',
      upstreamStatus: upstream.status,
      detail: await limitedError(upstream),
    });
  }
  if (!upstream.body) return json(502, { error: 'empty_stream' });
  const contentType = upstream.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    await upstream.body.cancel().catch(() => undefined);
    return json(502, { error: 'unexpected_response' });
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
