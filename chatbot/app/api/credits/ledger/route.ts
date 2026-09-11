import { proxyCredits } from '@/lib/credits-proxy';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return proxyCredits(request, 'ledger'); }
