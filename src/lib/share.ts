/* ============================================================
   Shareable-results v1 — Web Share API with a clipboard fallback.
   ============================================================
   No image-generation infrastructure exists on this site (no
   @vercel/og-equivalent, no Satori) and none was added here — this ships
   the achievable v1: native share sheet on supporting devices/browsers,
   falling back to copying a text summary to the clipboard everywhere
   else. Personalized OG-card images are an explicitly deferred Phase 3+
   item, not attempted here.
   ============================================================ */

export interface ShareResult {
  ok: boolean;
  method: 'share' | 'clipboard' | 'none';
}

export async function shareResult(title: string, text: string, url: string): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return { ok: true, method: 'share' };
    } catch (e) {
      // AbortError means the user cancelled the native share sheet — not a failure to report.
      if (e instanceof Error && e.name === 'AbortError') return { ok: false, method: 'share' };
      // Fall through to clipboard on any other failure (e.g. permission denied).
    }
  }
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      return { ok: true, method: 'clipboard' };
    } catch (e) {
      return { ok: false, method: 'clipboard' };
    }
  }
  return { ok: false, method: 'none' };
}

/** Wires a button to shareResult(), swapping its label to confirm success/failure. */
export function wireShareButton(buttonId: string, buildPayload: () => { title: string; text: string; url: string }) {
  const btn = document.getElementById(buttonId) as HTMLButtonElement | null;
  if (!btn) return;
  const defaultLabel = btn.textContent ?? 'Share';
  btn.addEventListener('click', async () => {
    const { title, text, url } = buildPayload();
    const result = await shareResult(title, text, url);
    if (result.method === 'share' && result.ok) return; // native share sheet handled it
    btn.textContent = result.ok ? 'Copied to clipboard!' : 'Could not share — copy manually';
    setTimeout(() => { btn.textContent = defaultLabel; }, 2500);
  });
}
