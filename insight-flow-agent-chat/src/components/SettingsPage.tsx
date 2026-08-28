import { ArrowLeft, Check, Eye, EyeOff, KeyRound, LockKeyhole, Save, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { loadAgentConfig, revealAgentApiKey, saveAgentConfig } from '../lib/config';
import type { AgentConfig } from '../lib/config';

type SettingsPageProps = {
  navigate: (path: string) => void;
};

export function SettingsPage({ navigate }: SettingsPageProps) {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [targetMode, setTargetMode] = useState<'model' | 'agent'>('model');
  const [target, setTarget] = useState('');
  const [disableTools, setDisableTools] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    loadAgentConfig()
      .then((next) => {
        if (!active) return;
        setConfig(next);
        setBaseUrl(next.insightFlowBaseUrl ?? '');
        setTargetMode(next.targetMode ?? 'model');
        setTarget(next.target ?? '');
        setDisableTools(Boolean(next.disableTools));
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : '无法读取配置。'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const next = await saveAgentConfig({
        insightFlowBaseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { insightFlowApiKey: apiKey.trim() } : {}),
        targetMode,
        target: target.trim(),
        disableTools,
      });
      setConfig(next);
      setApiKey('');
      setShowKey(false);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2400);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  }

  async function toggleKeyVisibility() {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (apiKey || !config?.configured) {
      setShowKey(true);
      return;
    }
    setRevealing(true);
    setError('');
    try {
      setApiKey(await revealAgentApiKey());
      setShowKey(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取 API Key。');
    } finally {
      setRevealing(false);
    }
  }

  return (
    <main className="settings-page">
      <header className="settings-topbar">
        <button className="icon-button" aria-label="返回聊天" type="button" onClick={() => navigate('/')}>
          <ArrowLeft aria-hidden="true" />
        </button>
        <strong>Agent 设置</strong>
      </header>
      <div className="settings-content">
        <div className="settings-heading">
          <h1>连接 Insight Flow</h1>
          <p>这里的配置只用于你的账号。聊天页不会显示完整 API Key。</p>
        </div>
        {loading ? <div className="settings-skeleton" aria-label="正在加载设置" /> : (
          <form className="settings-form" onSubmit={submit}>
            <section className="settings-section">
              <div>
                <h2>API 连接</h2>
                <p>连接信息保存在你的 InsForge 后端，并通过账号权限隔离。</p>
              </div>
              <div className="settings-fields">
                <label>
                  <span>Insight Flow Base URL</span>
                  <input
                    inputMode="url"
                    placeholder="https://your-insight-flow-host"
                    required
                    type="url"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </label>
                <label>
                  <span>API Key</span>
                  <span className="secure-input">
                    <KeyRound aria-hidden="true" />
                    <input
                      autoComplete="new-password"
                      placeholder={config?.configured ? config.apiKeyHint : '输入 API Key'}
                      required={!config?.configured}
                      spellCheck={false}
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                    />
                    <button
                      aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                      disabled={revealing}
                      type="button"
                      onClick={toggleKeyVisibility}
                    >
                      {showKey ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </span>
                  <small><LockKeyhole aria-hidden="true" /> 默认隐藏；点击眼睛后可查看完整密钥。</small>
                </label>
              </div>
            </section>

            <section className="settings-section">
              <div>
                <h2>Agent</h2>
                <p>推荐使用 PR #666 的 model 参数；agent 用于兼容已有调用。</p>
              </div>
              <div className="settings-fields">
                <fieldset>
                  <legend>目标参数</legend>
                  <div className="segmented-control">
                    <button aria-pressed={targetMode === 'model'} type="button" onClick={() => setTargetMode('model')}>model（推荐）</button>
                    <button aria-pressed={targetMode === 'agent'} type="button" onClick={() => setTargetMode('agent')}>agent（兼容）</button>
                  </div>
                </fieldset>
                <label>
                  <span>{targetMode === 'model' ? 'Model / Agent Key' : 'Agent Key'}</span>
                  <input
                    placeholder={targetMode === 'model' ? 'goclaw:research-agent' : 'research-agent'}
                    required
                    spellCheck={false}
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                  />
                  {targetMode === 'model' ? <small>省略 `goclaw:` 前缀时，服务端会自动补齐。</small> : null}
                </label>
                <label className="settings-switch">
                  <span><Wrench aria-hidden="true" /><span><strong>禁用 Agent 工具</strong><small>发送 tool_choice: none</small></span></span>
                  <input checked={disableTools} type="checkbox" onChange={(event) => setDisableTools(event.target.checked)} />
                </label>
              </div>
            </section>

            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <div className="settings-actions">
              <button className="secondary-action" type="button" onClick={() => navigate('/')}>取消</button>
              <button className="primary-action" disabled={saving} type="submit">
                {saved ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
                {saving ? '保存中…' : saved ? '已保存' : '保存设置'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
