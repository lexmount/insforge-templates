import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentViewer } from '@/lib/auth-state';
import { CreditsPanel } from '@/components/credits-panel';
export default async function CreditsPage() {
  const viewer = await getCurrentViewer();
  if (!viewer.isAuthenticated) redirect('/auth/sign-in');
  return <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6"><Link href="/" className="text-sm underline underline-offset-4">Back to chat</Link><h1 className="mb-8 mt-6 text-2xl font-semibold">Credits</h1><CreditsPanel /></main>;
}
