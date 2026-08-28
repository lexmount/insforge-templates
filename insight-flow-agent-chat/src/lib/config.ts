import { insforge } from './insforge';

export type AgentConfig = {
  configured: boolean;
  insightFlowBaseUrl?: string;
  targetMode?: 'model' | 'agent';
  target?: string;
  disableTools?: boolean;
  apiKeyHint?: string;
  updatedAt?: string | null;
};

export type AgentConfigInput = {
  insightFlowBaseUrl: string;
  insightFlowApiKey?: string;
  targetMode: 'model' | 'agent';
  target: string;
  disableTools: boolean;
};

const configErrorMessages: Record<string, string> = {
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

export function functionErrorMessage(reason: unknown, fallback: string) {
  if (!reason || typeof reason !== 'object') return fallback;
  const candidate = reason as { message?: unknown; error?: unknown };
  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message.trim();
  }
  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return configErrorMessages[candidate.error] ?? fallback;
  }
  return fallback;
}

export async function loadAgentConfig(): Promise<AgentConfig> {
  if (!insforge) throw new Error('InsForge 尚未连接。');
  const { data, error } = await insforge.functions.invoke<AgentConfig>('insight-flow-config', {
    method: 'GET',
  });
  if (error) throw error;
  return data ?? { configured: false };
}

export async function saveAgentConfig(input: AgentConfigInput): Promise<AgentConfig> {
  if (!insforge) throw new Error('InsForge 尚未连接。');
  const { data, error } = await insforge.functions.invoke<AgentConfig>('insight-flow-config', {
    method: 'PUT',
    body: input,
  });
  if (error) throw error;
  return data ?? { configured: false };
}

export async function revealAgentApiKey(): Promise<string> {
  if (!insforge) throw new Error('InsForge 尚未连接。');
  const { data, error } = await insforge.functions.invoke<{ apiKey: string }>('insight-flow-config', {
    method: 'POST',
    body: { action: 'reveal' },
  });
  if (error) throw error;
  if (!data?.apiKey) throw new Error('API Key 尚未配置。');
  return data.apiKey;
}
