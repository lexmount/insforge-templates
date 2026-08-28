import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  MessageSquarePlus,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  UserRound,
  Wrench,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { streamAgentReply } from './lib/stream';
import type { AgentChatRequest } from './lib/stream';

type TargetMode = 'model' | 'agent';

type ConnectionDraft = {
  insightFlowBaseUrl: string;
  insightFlowApiKey: string;
  targetMode: TargetMode;
  target: string;
  disableTools: boolean;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const initialConnection: ConnectionDraft = {
  insightFlowBaseUrl: import.meta.env.VITE_INSIGHT_FLOW_BASE_URL?.trim() ?? '',
  insightFlowApiKey: '',
  targetMode: 'model',
  target: '',
  disableTools: false,
};

const suggestions = [
  '介绍一下你能完成的任务，并给出三个具体例子。',
  '先分析我的目标，再列出你准备采取的步骤。',
  '用简洁的中文总结当前会话，并指出下一步。',
];

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function targetLabel(connection: ConnectionDraft | null) {
  if (!connection) return '尚未连接';
  if (connection.targetMode === 'agent') return `agent: ${connection.target}`;
  return connection.target.includes(':') ? connection.target : `goclaw:${connection.target}`;
}

export default function App() {
  const [draft, setDraft] = useState(initialConnection);
  const [connection, setConnection] = useState<ConnectionDraft | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const connectedLabel = useMemo(() => targetLabel(connection), [connection]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, isStreaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function updateDraft<Key extends keyof ConnectionDraft>(key: Key, value: ConnectionDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function applyConnection(event: FormEvent) {
    event.preventDefault();
    const baseUrl = draft.insightFlowBaseUrl.trim();
    const apiKey = draft.insightFlowApiKey.trim();
    const target = draft.target.trim();
    if (!baseUrl || !apiKey || !target) {
      setConfigurationError('请完整填写 Base URL、API Key 和目标 Agent。');
      return;
    }
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'https:') throw new Error();
    } catch {
      setConfigurationError('Base URL 必须是有效的 HTTPS 地址。');
      return;
    }
    if (/\s/.test(apiKey)) {
      setConfigurationError('API Key 不能包含空格。');
      return;
    }

    abortRef.current?.abort();
    setConnection({ ...draft, insightFlowBaseUrl: baseUrl, insightFlowApiKey: apiKey, target });
    setMessages([]);
    setSessionKey(null);
    setRequestError(null);
    setConfigurationError(null);
    setIsStreaming(false);
  }

  function resetConversation() {
    abortRef.current?.abort();
    setMessages([]);
    setSessionKey(null);
    setRequestError(null);
    setIsStreaming(false);
  }

  async function sendMessage(text: string) {
    const content = text.trim();
    if (!content || isStreaming) return;
    if (!connection) {
      setConfigurationError('请先应用连接配置。');
      return;
    }

    const userMessage: ChatMessage = { id: id('user'), role: 'user', content };
    const assistantId = id('assistant');
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '' };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setMessage('');
    setRequestError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const request: AgentChatRequest = {
      ...connection,
      message: content,
      ...(sessionKey ? { sessionKey } : {}),
    };

    try {
      const nextSessionKey = await streamAgentReply(request, controller.signal, (delta) => {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId ? { ...item, content: item.content + delta } : item,
          ),
        );
      });
      if (nextSessionKey) setSessionKey(nextSessionKey);
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId && !item.content
              ? { ...item, content: '已停止生成。' }
              : item,
          ),
        );
      } else {
        const detail = error instanceof Error ? error.message : 'Agent 请求失败。';
        setRequestError(detail);
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantId && !item.content
              ? { ...item, content: '这次没有收到 Agent 回复。' }
              : item,
          ),
        );
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function submitMessage(event: FormEvent) {
    event.preventDefault();
    void sendMessage(message);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(message);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1480px] flex-col px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        <header className="flex items-center justify-between gap-4 px-1 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Bot aria-hidden="true" className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-[-0.02em] sm:text-lg">
                Insight Flow Agent Chat
              </h1>
              <p className="truncate text-xs text-muted sm:text-sm">用自己的密钥连接指定 Agent</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-panel px-3 py-2 text-xs font-medium text-muted ring-1 ring-line sm:flex">
            <ShieldCheck aria-hidden="true" className="size-4 text-accent" />
            API Key 仅驻留当前页面内存
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="min-w-0 rounded-2xl bg-panel ring-1 ring-line">
            <form className="flex h-full min-w-0 flex-col" onSubmit={applyConnection}>
              <div className="border-b border-line px-5 py-5">
                <div className="flex items-center gap-2">
                  <Settings2 aria-hidden="true" className="size-4 text-accent" />
                  <h2 className="text-sm font-semibold">连接配置</h2>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted">
                  应用配置会开启一个新会话，不会保存你的密钥。
                </p>
              </div>

              <div className="space-y-5 px-5 py-5">
                <label className="field-group">
                  <span className="field-label">Insight Flow Base URL</span>
                  <input
                    className="field-input"
                    inputMode="url"
                    placeholder="https://your-insight-flow-host"
                    type="url"
                    value={draft.insightFlowBaseUrl}
                    onChange={(event) => updateDraft('insightFlowBaseUrl', event.target.value)}
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">API Key</span>
                  <span className="relative block">
                    <KeyRound aria-hidden="true" className="field-leading-icon" />
                    <input
                      autoComplete="off"
                      className="field-input pl-10 pr-11"
                      placeholder="goclaw_…"
                      spellCheck={false}
                      type={showApiKey ? 'text' : 'password'}
                      value={draft.insightFlowApiKey}
                      onChange={(event) => updateDraft('insightFlowApiKey', event.target.value)}
                    />
                    <button
                      aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                      className="field-trailing-button"
                      type="button"
                      onClick={() => setShowApiKey((current) => !current)}
                    >
                      {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </span>
                </label>

                <fieldset className="field-group">
                  <legend className="field-label">目标参数</legend>
                  <div className="grid grid-cols-2 rounded-xl bg-canvas p-1 ring-1 ring-line">
                    {(['model', 'agent'] as const).map((mode) => (
                      <button
                        key={mode}
                        aria-pressed={draft.targetMode === mode}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                          draft.targetMode === mode
                            ? 'bg-panel text-ink shadow-sm'
                            : 'text-muted hover:text-ink'
                        }`}
                        type="button"
                        onClick={() => updateDraft('targetMode', mode)}
                      >
                        {mode === 'model' ? 'model（推荐）' : 'agent（兼容）'}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="field-group">
                  <span className="field-label">
                    {draft.targetMode === 'model' ? 'Model / Agent Key' : 'Agent Key'}
                  </span>
                  <input
                    className="field-input font-mono text-[13px]"
                    placeholder={draft.targetMode === 'model' ? 'goclaw:research-agent' : 'research-agent'}
                    spellCheck={false}
                    value={draft.target}
                    onChange={(event) => updateDraft('target', event.target.value)}
                  />
                  {draft.targetMode === 'model' ? (
                    <span className="field-help">未填写 `goclaw:` 前缀时会自动补齐。</span>
                  ) : (
                    <span className="field-help">兼容 PR #666 支持的旧 `agent` 请求字段。</span>
                  )}
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-line">
                  <span className="flex min-w-0 items-center gap-3">
                    <Wrench aria-hidden="true" className="size-4 shrink-0 text-muted" />
                    <span>
                      <span className="block text-xs font-semibold">禁用 Agent 工具</span>
                      <span className="mt-0.5 block text-[11px] text-muted">发送 tool_choice: none</span>
                    </span>
                  </span>
                  <input
                    checked={draft.disableTools}
                    className="size-4 accent-[var(--accent)]"
                    type="checkbox"
                    onChange={(event) => updateDraft('disableTools', event.target.checked)}
                  />
                </label>

                {configurationError ? (
                  <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs leading-5 text-danger" role="alert">
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {configurationError}
                  </div>
                ) : null}
              </div>

              <div className="mt-auto border-t border-line p-4">
                <button className="primary-button w-full" type="submit">
                  <Radio aria-hidden="true" className="size-4" />
                  应用并开始新会话
                </button>
              </div>
            </form>
          </aside>

          <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-2xl bg-panel shadow-panel lg:min-h-0">
            <div className="flex min-h-16 items-center justify-between gap-4 border-b border-line px-4 sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {connection ? (
                    <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Radio aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  )}
                  <h2 className="truncate text-sm font-semibold">{connectedLabel}</h2>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {sessionKey ? '连续会话已建立' : connection ? '等待第一条消息' : '填写左侧配置后开始'}
                </p>
              </div>
              <button
                className="secondary-button"
                disabled={messages.length === 0 && !sessionKey}
                type="button"
                onClick={resetConversation}
              >
                <MessageSquarePlus aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">新会话</span>
              </button>
            </div>

            <div className="chat-scroll flex-1 overflow-y-auto px-4 py-6 sm:px-8" role="log" aria-live="polite">
              {messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-12 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-accent">
                    <Bot aria-hidden="true" className="size-7" />
                  </div>
                  <h2 className="mt-5 text-xl font-semibold tracking-[-0.025em]">
                    {connection ? 'Agent 已就绪' : '连接你的 Insight Flow Agent'}
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                    {connection
                      ? '选择一个开场问题，或者直接在下方输入。回复将通过 InsForge Edge Function 以 SSE 分块传输。'
                      : '提供 Base URL、API Key 和 Agent 标识。密钥只在当前页面和本次代理请求中使用。'}
                  </p>
                  {connection ? (
                    <div className="mt-7 flex w-full max-w-xl flex-col gap-2">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          className="rounded-xl bg-canvas px-4 py-3 text-left text-sm leading-5 text-ink ring-1 ring-line transition hover:bg-indigo-50/60 hover:ring-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          type="button"
                          onClick={() => void sendMessage(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mx-auto flex max-w-3xl flex-col gap-6">
                  {messages.map((item) => (
                    <article key={item.id} className={`message-row ${item.role}`}>
                      <div className="message-avatar">
                        {item.role === 'assistant' ? (
                          <Bot aria-hidden="true" className="size-4" />
                        ) : (
                          <UserRound aria-hidden="true" className="size-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 text-xs font-semibold text-muted">
                          {item.role === 'assistant' ? 'Agent' : '你'}
                        </div>
                        <div className="whitespace-pre-wrap break-words text-[15px] leading-7">
                          {item.content || (
                            <span className="inline-flex items-center gap-2 text-muted">
                              <span className="streaming-dot" />
                              Agent 正在处理
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            <div className="border-t border-line px-3 py-3 sm:px-6 sm:py-4">
              {requestError ? (
                <div className="mx-auto mb-3 flex max-w-3xl items-start justify-between gap-3 rounded-xl bg-red-50 px-3.5 py-3 text-xs text-danger" role="alert">
                  <span className="flex items-start gap-2 leading-5">
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    {requestError}
                  </span>
                  <button className="shrink-0 font-semibold underline underline-offset-2" type="button" onClick={() => setRequestError(null)}>
                    关闭
                  </button>
                </div>
              ) : null}
              <form className="composer mx-auto max-w-3xl" onSubmit={submitMessage}>
                <textarea
                  aria-label="发送给 Agent 的消息"
                  className="min-h-12 max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 outline-none placeholder:text-muted"
                  disabled={!connection || isStreaming}
                  placeholder={connection ? '给 Agent 发送消息…' : '请先应用连接配置'}
                  rows={1}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                />
                {isStreaming ? (
                  <button
                    aria-label="停止生成"
                    className="composer-action bg-ink text-white"
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                  >
                    <Square aria-hidden="true" className="size-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    aria-label="发送消息"
                    className="composer-action bg-accent text-white disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!connection || !message.trim()}
                    type="submit"
                  >
                    <Send aria-hidden="true" className="size-4" />
                  </button>
                )}
              </form>
              <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between gap-3 px-1 text-[11px] text-muted">
                <span>Enter 发送 · Shift + Enter 换行</span>
                <span className="hidden items-center gap-1 sm:flex">
                  <RotateCcw aria-hidden="true" className="size-3" />
                  更换配置会重置会话
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
