/**
 * WhatsApp "click-to-chat" links (wa.me) work with zero setup — no API key, no Meta Business
 * account — but only ever pre-fill a text message in WhatsApp; the person still taps Send
 * themselves, and a link can't carry an attached file. Automatic, unattended sending (e.g. a
 * nightly reminder job with no one clicking anything, or attaching a PDF/image directly) needs
 * the paid WhatsApp Business API (Meta-verified business + phone number), which isn't wired up
 * here. Swap `openWhatsAppChat` for a real API call once those credentials exist.
 */
export function buildWhatsAppLink(rawNumber: string, message: string): string {
  const digitsOnly = rawNumber.replace(/[^0-9]/g, '');
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
}

export function openWhatsAppChat(rawNumber: string, message: string): void {
  window.open(buildWhatsAppLink(rawNumber, message), '_blank', 'noopener,noreferrer');
}
