import { proxyCredits } from '@/lib/credits-proxy';
export const dynamic = 'force-dynamic';
export function POST(request: Request) { return proxyCredits(request, 'redeem'); }
