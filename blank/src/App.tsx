import { getInsforgeConfig } from './lib/insforge'

export default function App() {
  const configured = getInsforgeConfig().isConfigured

  return (
    <main>
      <p className="eyebrow">InsForge blank app</p>
      <h1>Start building.</h1>
      <p>
        The InsForge client and production analytics are ready. The optional AI helper is available
        in <code>src/lib/ai.ts</code> when AI is enabled for this application.
      </p>
      <span className={configured ? 'ready' : 'local'}>
        {configured ? 'Backend connected' : 'Add local environment values to connect'}
      </span>
    </main>
  )
}
