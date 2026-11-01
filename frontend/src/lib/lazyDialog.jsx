import { lazy, Suspense } from "react";

// A dialog that only opens on demand is loaded as its own small file instead of with the app, so the app
// starts sooner. A few seconds after start the browser fetches it in the background (idle time, never
// competing with the first screen), so the first tap still opens it instantly.
export function lazyDialog(loader) {
  let started = null;
  const load = () => (started ||= loader());
  const Inner = lazy(load);
  const idle = typeof window !== "undefined" ? window.requestIdleCallback || ((fn) => setTimeout(fn, 1)) : null;
  if (idle) setTimeout(() => idle(() => load().catch(() => (started = null))), 4000);
  const Dialog = (props) => (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
  Dialog.preload = load;
  return Dialog;
}
