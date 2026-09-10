export function chatFailure(code: string | undefined, message: string) {
  if (code === 'INSUFFICIENT_CREDITS') return { message: 'Insufficient credits. Open Credits to redeem a code or contact your administrator.', action: 'credits' as const };
  if (code === 'UNSUPPORTED_BILLING_MODALITY') return { message: 'This application currently bills text chat only. An image or PDF in this message or earlier conversation cannot be included. Your attachments are preserved. Start a new text-only conversation to continue.', action: 'new-chat' as const };
  return { message, action: null };
}
