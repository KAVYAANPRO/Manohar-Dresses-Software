import { useEffect, useRef, useState } from 'react';

const PREFIX = 'md_draft:';

export interface DraftEnvelope<T> { savedAt: string; data: T }

function read<T>(key: string): DraftEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as DraftEnvelope<T>) : null;
  } catch {
    return null;
  }
}

/** Remove a saved draft (call after the form is submitted successfully). */
export function clearDraft(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* storage unavailable */ }
}

/** All saved drafts (for a "Drafts" list). */
export function listDrafts(): { key: string; savedAt: string }[] {
  const out: { key: string; savedAt: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const d = read(k.slice(PREFIX.length));
      if (d) out.push({ key: k.slice(PREFIX.length), savedAt: d.savedAt });
    }
  } catch { /* storage unavailable */ }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Keeps a form's state saved on this device as it is filled in, so pressing Back, closing the
 * tab or losing the page by mistake never throws the work away. On the next visit the draft is
 * restored automatically (`restoredAt` is set so the page can say so and offer "Discard").
 *
 * - `value` is the form state to save (must be JSON-serialisable); `restore` puts it back.
 * - `enabled` = false while the form is still loading reference data, so an empty initial
 *   state doesn't overwrite the draft before it has been restored.
 * - Call `clear()` after a successful save.
 * - `isEmpty(value)` (optional) - don't keep a draft of an untouched form.
 */
export function useDraft<T>(
  key: string,
  value: T,
  restore: (data: T) => void,
  opts: { enabled?: boolean; isEmpty?: (v: T) => boolean } = {},
) {
  const { enabled = true, isEmpty } = opts;
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const restoredRef = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Restore once, as soon as the form is ready.
  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    const d = read<T>(key);
    if (d) {
      restoreRef.current(d.data);
      setRestoredAt(d.savedAt);
    }
  }, [enabled, key]);

  // Save (debounced) on every change after the restore step has run.
  useEffect(() => {
    if (!enabled || !restoredRef.current) return;
    const t = window.setTimeout(() => {
      try {
        if (isEmpty?.(value)) localStorage.removeItem(PREFIX + key);
        else localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: new Date().toISOString(), data: value }));
      } catch { /* storage full / unavailable - drafts just won't persist */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [enabled, key, value, isEmpty]);

  return {
    restoredAt,
    clear: () => { clearDraft(key); setRestoredAt(null); },
  };
}
