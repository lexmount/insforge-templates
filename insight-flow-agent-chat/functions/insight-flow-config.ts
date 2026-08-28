/// <reference lib="deno.ns" />

import { createClient } from 'npm:@insforge/sdk@1.5.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

type StoredConfig = {
  base_url: string;
  target_mode: 'model' | 'agent';
  target: string;
  disable_tools: boolean;
  encrypted_api_key: string;
  api_key_iv: string;
  api_key_last_four: string;
  updated_at?: string;
};

type ConfigInput = {
  insightFlowBaseUrl?: string;
  insightFlowApiKey?: string;
  targetMode?: 'model' | 'agent';
  target?: string;
  disableTools?: boolean;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function encryptionKeyBytes() {
  const encoded = Deno.env.get('INSIGHT_FLOW_CONFIG_ENCRYPTION_KEY')?.trim();
  if (!encoded) throw new Error('missing_encryption_key');
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error('invalid_encryption_key');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('invalid_encryption_key');
  return bytes;
}

export async function encryptApiKey(value: string) {
  const key = await crypto.subtle.importKey('raw', encryptionKeyBytes(), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  return { encryptedApiKey: bytesToBase64(new Uint8Array(encrypted)), apiKeyIv: bytesToBase64(iv) };
}

function normalizeBaseUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('invalid_base_url');
  }
  const host = url.hostname.toLowerCase();
  const ipv4 = host.split('.').map(Number);
  const privateIPv4 = ipv4.length === 4 && ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && (
    ipv4[0] === 0 || ipv4[0] === 10 || ipv4[0] === 127 ||
    (ipv4[0] === 169 && ipv4[1] === 254) ||
    (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) ||
    (ipv4[0] === 192 && ipv4[1] === 168)
  );
  const normalizedIPv6 = host.replace(/^\[|\]$/g, '').toLowerCase();
  const privateIPv6 = normalizedIPv6 === '::1' || normalizedIPv6.startsWith('fc') ||
    normalizedIPv6.startsWith('fd') || /^fe[89ab]/.test(normalizedIPv6);
  if (host === 'localhost' || host.endsWith('.localhost') || privateIPv4 || privateIPv6) {
    throw new Error('private_base_url');
  }
  const allowedHosts = (Deno.env.get('INSIGHT_FLOW_ALLOWED_HOSTS') ?? '')
    .split(',')
    .map((item: string) => item.trim().toLowerCase())
    .filter(Boolean);
  if (allowedHosts.length > 0 && !allowedHosts.includes(host)) throw new Error('host_not_allowed');
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
    apiKeyHint: `••••${config.api_key_last_four}`,
    updatedAt: config.updated_at ?? null,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'PUT') return json(405, { error: 'method_not_allowed' });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'unauthorized' });
  const client = createClient({ baseUrl: Deno.env.get('INSFORGE_BASE_URL'), accessToken: token });
  const { data: identity } = await client.auth.getCurrentUser();
  const userId = identity?.user?.id;
  if (!userId) return json(401, { error: 'unauthorized' });

  const { data: existingData, error: readError } = await client.database
    .from('insight_flow_agent_configs')
    .select('base_url,target_mode,target,disable_tools,encrypted_api_key,api_key_iv,api_key_last_four,updated_at')
    .maybeSingle();
  if (readError) return json(500, { error: 'config_read_failed', detail: readError.message });
  const existing = (existingData as StoredConfig | null) ?? null;
  if (req.method === 'GET') return json(200, publicConfig(existing));

  let input: ConfigInput;
  try {
    input = (await req.json()) as ConfigInput;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const target = input.target?.trim() ?? '';
  const apiKey = input.insightFlowApiKey?.trim() ?? '';
  if (!target || target.length > 200) return json(422, { error: 'invalid_target' });
  if (apiKey && (apiKey.length > 512 || /\s/.test(apiKey))) return json(422, { error: 'invalid_api_key' });
  if (!apiKey && !existing) return json(422, { error: 'api_key_required' });

  let baseUrl: string;
  try {
    baseUrl = normalizeBaseUrl(input.insightFlowBaseUrl?.trim() ?? '');
  } catch {
    return json(422, { error: 'invalid_base_url' });
  }

  let encryptedApiKey = existing?.encrypted_api_key ?? '';
  let apiKeyIv = existing?.api_key_iv ?? '';
  let apiKeyLastFour = existing?.api_key_last_four ?? '';
  if (apiKey) {
    try {
      const encrypted = await encryptApiKey(apiKey);
      encryptedApiKey = encrypted.encryptedApiKey;
      apiKeyIv = encrypted.apiKeyIv;
      apiKeyLastFour = apiKey.slice(-4);
    } catch (error) {
      return json(503, { error: error instanceof Error ? error.message : 'encryption_failed' });
    }
  }

  const targetMode: 'model' | 'agent' = input.targetMode === 'agent' ? 'agent' : 'model';
  const row: Omit<StoredConfig, 'updated_at'> = {
    base_url: baseUrl,
    target_mode: targetMode,
    target,
    disable_tools: Boolean(input.disableTools),
    encrypted_api_key: encryptedApiKey,
    api_key_iv: apiKeyIv,
    api_key_last_four: apiKeyLastFour,
  };
  const result = existing
    ? await client.database.from('insight_flow_agent_configs').update(row).eq('user_id', userId)
    : await client.database.from('insight_flow_agent_configs').insert([row]);
  if (result.error) return json(500, { error: 'config_save_failed', detail: result.error.message });
  return json(200, publicConfig({ ...row, updated_at: new Date().toISOString() }));
}
