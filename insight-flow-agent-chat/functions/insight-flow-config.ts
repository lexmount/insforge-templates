/// <reference lib="deno.ns" />

import { createClient } from 'npm:@insforge/sdk@1.5.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

type StoredConfig = {
  base_url: string;
  target_mode: 'model' | 'agent';
  target: string;
  disable_tools: boolean;
  api_key: string;
  updated_at?: string;
};

type ConfigInput = {
  insightFlowBaseUrl?: string;
  insightFlowApiKey?: string;
  targetMode?: 'model' | 'agent';
  target?: string;
  disableTools?: boolean;
};

const errorMessages: Record<string, string> = {
  method_not_allowed: '不支持该请求方法。',
  AUTH_UNAUTHORIZED: '登录状态已失效，请重新登录。',
  config_read_failed: '无法读取 Agent 配置。',
  invalid_json: '请求内容不是有效的 JSON。',
  invalid_action: '不支持该配置操作。',
  agent_not_configured: '尚未配置 Insight Flow Agent。',
  invalid_target: '请填写有效的 Model 或 Agent 参数。',
  invalid_api_key: 'API Key 格式无效。',
  api_key_required: '首次保存时必须填写 API Key。',
  invalid_base_url: 'Base URL 必须是不带查询参数的 HTTPS 地址。',
  private_base_url: '该地址指向本地或内网，请填写公网 HTTPS 地址。',
  host_not_allowed: '该 Host 不在 INSIGHT_FLOW_ALLOWED_HOSTS 允许列表内。',
  config_save_failed: '无法保存 Agent 配置。',
};

function json(status: number, body: Record<string, unknown>) {
  const error = typeof body.error === 'string' ? body.error : '';
  const payload = error && !body.message
    ? { ...body, message: errorMessages[error] ?? '请求处理失败。' }
    : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
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
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && ((b === 0 && (c === 0 || c === 2)) || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

export function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const isIPv6Literal = host.startsWith('[') && host.endsWith(']');
  const bare = isIPv6Literal ? host.slice(1, -1) : host;
  const privateIPv6 = isIPv6Literal && (
    bare === '::' || bare === '::1' || bare.startsWith('fc') || bare.startsWith('fd') || /^fe[89ab]/.test(bare)
  );
  return host === 'localhost' || host.endsWith('.localhost') || privateIPv6 ||
    isNonPublicIPv4(ipv4Parts(host)) || (isIPv6Literal && isNonPublicIPv4(embeddedIPv4(bare)));
}

function normalizeBaseUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('invalid_base_url');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
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

function publicConfig(config: StoredConfig | null) {
  if (!config) return { configured: false };
  return {
    configured: true,
    insightFlowBaseUrl: config.base_url,
    targetMode: config.target_mode,
    target: config.target,
    disableTools: config.disable_tools,
    apiKeyHint: '••••••••••••',
    updatedAt: config.updated_at ?? null,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT') {
    return json(405, { error: 'method_not_allowed' });
  }

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'AUTH_UNAUTHORIZED' });
  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    accessToken: token,
  });
  const { data: identity } = await client.auth.getCurrentUser();
  const userId = identity?.user?.id;
  if (!userId) return json(401, { error: 'AUTH_UNAUTHORIZED' });

  const { data: existingData, error: readError } = await client.database
    .from('insight_flow_agent_configs')
    .select('base_url,target_mode,target,disable_tools,api_key,updated_at')
    .maybeSingle();
  if (readError) {
    return json(500, {
      error: 'config_read_failed',
      detail: readError.message,
    });
  }
  const existing = (existingData as StoredConfig | null) ?? null;
  if (req.method === 'GET') return json(200, publicConfig(existing));

  if (req.method === 'POST') {
    let action: { action?: string };
    try {
      action = (await req.json()) as { action?: string };
    } catch {
      return json(400, { error: 'invalid_json' });
    }
    if (action.action !== 'reveal') {
      return json(422, { error: 'invalid_action' });
    }
    if (!existing) return json(404, { error: 'agent_not_configured' });
    return json(200, { apiKey: existing.api_key });
  }

  let input: ConfigInput;
  try {
    input = (await req.json()) as ConfigInput;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const target = input.target?.trim() ?? '';
  const apiKey = input.insightFlowApiKey?.trim() ?? '';
  if (!target || target.length > 200) {
    return json(422, { error: 'invalid_target' });
  }
  if (apiKey && (apiKey.length > 512 || /\s/.test(apiKey))) {
    return json(422, { error: 'invalid_api_key' });
  }
  if (!apiKey && !existing) return json(422, { error: 'api_key_required' });

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(input.insightFlowBaseUrl?.trim() ?? '');
  } catch (reason) {
    const error = reason instanceof Error && ['private_base_url', 'host_not_allowed'].includes(reason.message) ? reason.message : 'invalid_base_url';
    return json(422, { error });
  }

  const targetMode: 'model' | 'agent' = input.targetMode === 'agent' ? 'agent' : 'model';
  const row: Omit<StoredConfig, 'updated_at'> = {
    base_url: baseUrl,
    target_mode: targetMode,
    target,
    disable_tools: Boolean(input.disableTools),
    api_key: apiKey || existing?.api_key || '',
  };
  const result = await client.database.rpc('save_insight_flow_agent_config', {
    p_base_url: row.base_url,
    p_target_mode: row.target_mode,
    p_target: row.target,
    p_disable_tools: row.disable_tools,
    p_api_key: row.api_key,
  });
  if (result.error) {
    return json(500, {
      error: 'config_save_failed',
      detail: result.error.message,
    });
  }
  return json(
    200,
    publicConfig({ ...row, updated_at: new Date().toISOString() }),
  );
}
