import { ArrowRight, Bot, KeyRound, Mail } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { insforge } from '../lib/insforge';

type AuthUser = { id: string; email?: string };

export function AuthScreen({ onSignedIn }: { onSignedIn: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!insforge || busy) return;
    setBusy(true);
    setError('');
    try {
      if (step === 'email') {
        const { error: sendError } = await insforge.auth.signInWithOtp({ email: email.trim() });
        if (sendError) throw sendError;
        setStep('otp');
      } else {
        const { data, error: verifyError } = await insforge.auth.verifyOtp({
          email: email.trim(),
          otp: otp.trim(),
        });
        if (verifyError) throw verifyError;
        if (!data?.user) throw new Error('登录成功，但没有收到用户信息。');
        onSignedIn({ id: data.user.id, email: data.user.email });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '登录失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="brand-mark large"><Bot aria-hidden="true" /></div>
        <h1 id="auth-title">登录后开始对话</h1>
        <p>你的 Agent 配置保存在 InsForge 后端，并与当前账号隔离。</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            <span>邮箱</span>
            <span className="input-with-icon">
              <Mail aria-hidden="true" />
              <input
                autoComplete="email"
                disabled={step === 'otp'}
                inputMode="email"
                placeholder="you@example.com"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>
          {step === 'otp' ? (
            <label>
              <span>验证码</span>
              <span className="input-with-icon">
                <KeyRound aria-hidden="true" />
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6 位验证码"
                  required
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                />
              </span>
            </label>
          ) : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="auth-submit" disabled={busy} type="submit">
            {busy ? '请稍候…' : step === 'email' ? '发送登录验证码' : '验证并登录'}
            {!busy ? <ArrowRight aria-hidden="true" /> : null}
          </button>
        </form>
        {step === 'otp' ? (
          <button className="text-button" type="button" onClick={() => { setStep('email'); setOtp(''); setError(''); }}>
            更换邮箱
          </button>
        ) : null}
      </section>
    </main>
  );
}
