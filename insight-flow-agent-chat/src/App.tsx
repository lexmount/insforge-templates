import { Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { ChatPage } from './components/ChatPage';
import { SettingsPage } from './components/SettingsPage';
import { connected, insforge } from './lib/insforge';

type AuthUser = { id: string; email?: string };

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(connected);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!insforge) return;
    let active = true;
    insforge.auth.getCurrentUser().then(({ data }) => {
      if (!active) return;
      setUser(data?.user ? { id: data.user.id, email: data.user.email } : null);
      setAuthLoading(false);
    });
    return () => { active = false; };
  }, []);

  function navigate(nextPath: string) {
    if (window.location.pathname !== nextPath) window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function signOut() {
    await insforge?.auth.signOut();
    setUser(null);
    navigate('/');
  }

  if (!connected) {
    return (
      <main className="setup-missing">
        <span className="brand-mark large"><Bot aria-hidden="true" /></span>
        <h1>连接 InsForge 后开始</h1>
        <p>请在环境变量中配置 `VITE_INSFORGE_URL` 和 `VITE_INSFORGE_ANON_KEY`。</p>
      </main>
    );
  }

  if (authLoading) {
    return <main className="app-loading" aria-label="正在恢复登录状态"><span className="brand-mark large"><Bot aria-hidden="true" /></span></main>;
  }
  if (!user) return <AuthScreen onSignedIn={setUser} />;
  if (path === '/settings') return <SettingsPage navigate={navigate} />;
  return <ChatPage email={user.email} navigate={navigate} onSignOut={() => void signOut()} />;
}
