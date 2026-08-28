import {
  Bot,
  Check,
  Copy,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  Send,
  Settings,
  Square,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { functionErrorMessage, loadAgentConfig } from '../lib/config';
import type { AgentConfig } from '../lib/config';
import { streamAgentReply } from '../lib/stream';

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };
type ChatPageProps = {
  email?: string;
  navigate: (path: string) => void;
  onSignOut: () => void;
};

const starters = [
  '介绍一下你能帮我完成什么',
  '帮我分析一个复杂问题',
  '先问我几个问题，再开始执行',
];

function messageId(role: string) {
  return `${role}-${crypto.randomUUID()}`;
}

export function ChatPage({ email, navigate, onSignOut }: ChatPageProps) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    loadAgentConfig()
      .then((next) => active && setConfig(next))
      .catch((reason) => active && setError(functionErrorMessage(reason, '无法读取 Agent 配置。')))
      .finally(() => active && setConfigLoading(false));
    return () => { active = false; abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, isStreaming]);

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setMessage('');
    setSessionKey(null);
    setError('');
    setWarning('');
    setIsStreaming(false);
    setSidebarOpen(false);
  }

  async function sendMessage(raw: string) {
    const content = raw.trim();
    if (!content || isStreaming || !config?.configured) return;
    const assistantId = messageId('assistant');
    setMessages((current) => [
      ...current,
      { id: messageId('user'), role: 'user', content },
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setMessage('');
    setError('');
    setWarning('');
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const nextSessionKey = await streamAgentReply(
        { message: content, ...(sessionKey ? { sessionKey } : {}) },
        controller.signal,
        (delta) => setMessages((current) => current.map((item) => (
          item.id === assistantId ? { ...item, content: item.content + delta } : item
        ))),
        (headerSessionKey) => {
          if (headerSessionKey) setSessionKey(headerSessionKey);
        },
      );
      if (nextSessionKey) setSessionKey(nextSessionKey);
      else setWarning('未收到会话标识，下一条消息可能会开启新会话。');
    } catch (reason) {
      if (controller.signal.aborted) {
        setMessages((current) => current.map((item) => (
          item.id === assistantId && !item.content ? { ...item, content: '已停止生成。' } : item
        )));
      } else {
        const detail = reason instanceof Error ? reason.message : 'Agent 请求失败。';
        setError(detail);
        setMessages((current) => current.filter((item) => item.id !== assistantId || Boolean(item.content)));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsStreaming(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(message);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(message);
    }
  }

  async function copyMessage(item: ChatMessage) {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1400);
    } catch {
      setError('复制失败，请手动选择回复内容。');
    }
  }

  const targetLabel = config?.target
    ? config.targetMode === 'agent'
      ? config.target
      : config.target.includes(':') ? config.target : `goclaw:${config.target}`
    : 'Insight Flow Agent';

  return (
    <main className="chat-app">
      {sidebarOpen ? <button className="sidebar-backdrop" aria-label="关闭侧栏" type="button" onClick={() => setSidebarOpen(false)} /> : null}
      <aside className={`chat-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-heading">
          <div className="brand-lockup"><span className="brand-mark"><Bot aria-hidden="true" /></span><strong>Agent Chat</strong></div>
          <button className="sidebar-close" aria-label="关闭侧栏" type="button" onClick={() => setSidebarOpen(false)}><PanelLeftClose aria-hidden="true" /></button>
        </div>
        <button className="new-chat-button" type="button" onClick={newChat}>
          <MessageSquarePlus aria-hidden="true" /> 新对话
        </button>
        <div className="sidebar-history">
          <span>今天</span>
          {messages.length > 0 ? (
            <button type="button" className="history-item active" onClick={() => setSidebarOpen(false)}>
              {messages.find((item) => item.role === 'user')?.content ?? '新对话'}
            </button>
          ) : <p>对话记录仅保留在当前页面。</p>}
        </div>
        <div className="sidebar-account">
          <button type="button" onClick={() => navigate('/settings')}>
            <Settings aria-hidden="true" /><span><strong>设置</strong><small>{config?.configured ? targetLabel : '配置 Agent'}</small></span>
          </button>
          <button type="button" onClick={onSignOut}>
            <span className="user-avatar">{email?.slice(0, 1).toUpperCase() || <UserRound aria-hidden="true" />}</span>
            <span><strong className="account-email">{email || '当前账号'}</strong><small>退出登录</small></span>
          </button>
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-topbar">
          <button className="mobile-menu" aria-label="打开侧栏" type="button" onClick={() => setSidebarOpen(true)}><Menu aria-hidden="true" /></button>
          <div className="model-label"><strong>{targetLabel}</strong>{config?.configured ? <span>已连接</span> : null}</div>
          <button className="topbar-settings" aria-label="Agent 设置" type="button" onClick={() => navigate('/settings')}><Settings aria-hidden="true" /></button>
        </header>

        <div className="chat-transcript" role="log" aria-live="polite">
          {configLoading ? (
            <div className="chat-loading"><span /><span /><span /></div>
          ) : !config?.configured ? (
            <div className="chat-empty">
              <span className="empty-mark"><Bot aria-hidden="true" /></span>
              <h1>先连接你的 Agent</h1>
              <p>在独立设置页保存 Insight Flow 连接。API Key 默认隐藏，聊天页面不会显示它。</p>
              <button className="primary-action" type="button" onClick={() => navigate('/settings')}><Settings aria-hidden="true" />打开设置</button>
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty ready">
              <span className="empty-mark"><Bot aria-hidden="true" /></span>
              <h1>有什么可以帮忙的？</h1>
              <div className="starter-list">
                {starters.map((starter) => <button key={starter} type="button" onClick={() => void sendMessage(starter)}>{starter}</button>)}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((item) => (
                <article className={`chat-message ${item.role}`} key={item.id}>
                  {item.role === 'assistant' ? <span className="assistant-avatar"><Bot aria-hidden="true" /></span> : null}
                  <div className="message-content">
                    {item.role === 'assistant' ? (
                      item.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown> : <span className="typing-indicator"><i /><i /><i /></span>
                    ) : <p>{item.content}</p>}
                    {item.role === 'assistant' && item.content ? (
                      <button className="copy-button" aria-label="复制回复" type="button" onClick={() => void copyMessage(item)}>
                        {copiedId === item.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="composer-dock">
          {warning ? <div className="chat-warning" role="status"><span>{warning}</span><button aria-label="关闭提示" type="button" onClick={() => setWarning('')}><X aria-hidden="true" /></button></div> : null}
          {error ? <div className="chat-error" role="alert"><span>{error}</span><button aria-label="关闭错误" type="button" onClick={() => setError('')}><X aria-hidden="true" /></button></div> : null}
          <form className="chat-composer" onSubmit={submit}>
            <textarea
              aria-label="给 Agent 发送消息"
              disabled={!config?.configured || isStreaming}
              placeholder={config?.configured ? '给 Agent 发送消息' : '请先配置 Agent'}
              rows={1}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            {isStreaming ? (
              <button className="send-button stop" aria-label="停止生成" type="button" onClick={() => abortRef.current?.abort()}><Square aria-hidden="true" /></button>
            ) : (
              <button className="send-button" aria-label="发送消息" disabled={!config?.configured || !message.trim()} type="submit"><Send aria-hidden="true" /></button>
            )}
          </form>
          <p>Agent 可能会出错，请核对重要信息。</p>
        </div>
      </section>
    </main>
  );
}
