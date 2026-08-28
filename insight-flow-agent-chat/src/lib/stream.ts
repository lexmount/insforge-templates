export type StreamDelta = {
  choices?: Array<{
    delta?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

function deltaText(payload: StreamDelta): string {
  const content = payload.choices?.[0]?.delta?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('');
  }
  return '';
}

function eventData(block: string): string | null {
  const lines = block.split(/\r?\n/);
  const data = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  return data || null;
}

export async function consumeInsightFlowSSE(
  stream: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const consumeBlock = (block: string) => {
    const data = eventData(block);
    if (!data) return false;
    if (data === '[DONE]') return true;

    let payload: StreamDelta;
    try {
      payload = JSON.parse(data) as StreamDelta;
    } catch {
      throw new Error('Insight Flow 返回了无法解析的流式事件。');
    }
    if (payload.error?.message) throw new Error(payload.error.message);
    const text = deltaText(payload);
    if (text) onDelta(text);
    return false;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (consumeBlock(block)) return;
      }
      if (done) break;
    }
    if (buffer.trim() && consumeBlock(buffer)) return;
  } finally {
    reader.releaseLock();
  }
}

export type AgentChatRequest = {
  insightFlowBaseUrl: string;
  insightFlowApiKey: string;
  targetMode: 'model' | 'agent';
  target: string;
  message: string;
  sessionKey?: string;
  disableTools?: boolean;
};

function functionUrl() {
  const baseUrl = import.meta.env.VITE_INSFORGE_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) throw new Error('缺少 VITE_INSFORGE_URL。');
  return `${baseUrl}/functions/insight-flow-chat`;
}

export async function streamAgentReply(
  request: AgentChatRequest,
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<string | null> {
  const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY?.trim();
  if (!anonKey) throw new Error('缺少 VITE_INSFORGE_ANON_KEY。');

  const response = await fetch(functionUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; detail?: string }
      | null;
    throw new Error(payload?.detail || payload?.error || `请求失败（${response.status}）`);
  }
  if (!response.body) throw new Error('浏览器没有收到可读取的响应流。');

  const sessionKey = response.headers.get('X-InsightFlow-Session-Key');
  await consumeInsightFlowSSE(response.body, onDelta);
  return sessionKey;
}
