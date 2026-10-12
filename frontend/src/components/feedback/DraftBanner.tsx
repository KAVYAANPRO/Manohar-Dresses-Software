import { FileClock } from 'lucide-react';

interface DraftBannerProps {
  restoredAt: string | null;
  onDiscard: () => void;
}

/** "Draft restored from 10:42 · Discard" - shown when a form came back from a saved draft. */
export function DraftBanner({ restoredAt, onDiscard }: DraftBannerProps) {
  if (!restoredAt) return null;
  const when = new Date(restoredAt);
  const label = when.toDateString() === new Date().toDateString()
    ? when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : when.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="animate-fade-in flex items-center gap-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
      <FileClock size={18} className="shrink-0" />
      <span className="flex-1">Your unsaved draft from {label} was restored.</span>
      <button type="button" onClick={onDiscard} className="shrink-0 min-h-9 px-3 rounded-md font-semibold text-amber-900 hover:bg-amber-100">Discard</button>
    </div>
  );
}
