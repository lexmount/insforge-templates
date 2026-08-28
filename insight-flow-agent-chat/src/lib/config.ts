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
