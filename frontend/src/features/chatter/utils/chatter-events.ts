export const CHATTER_REFRESH_EVENT = 'chatter:refresh';
export const CHATTER_REFRESH_STORAGE_KEY = 'chatter_refresh_ping_v1';

export type ChatterRefreshDetail = {
  taskId?: string | null;
  projectId?: string | null;
  postId?: string | null;
};

export function emitChatterRefresh(detail?: ChatterRefreshDetail) {
  if (typeof window === 'undefined') return;
  const payload = detail ?? {};
  window.dispatchEvent(new CustomEvent(CHATTER_REFRESH_EVENT, { detail: payload }));
  // Cross-tab: CustomEvent is same-tab only; localStorage notifies other tabs.
  try {
    localStorage.setItem(
      CHATTER_REFRESH_STORAGE_KEY,
      JSON.stringify({ ...payload, at: Date.now() }),
    );
  } catch {
    // ignore quota / privacy mode
  }
}

export function onChatterRefresh(handler: (detail: ChatterRefreshDetail) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<ChatterRefreshDetail>;
    handler(custom.detail ?? {});
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== CHATTER_REFRESH_STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as ChatterRefreshDetail;
      handler(parsed ?? {});
    } catch {
      handler({});
    }
  };
  window.addEventListener(CHATTER_REFRESH_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHATTER_REFRESH_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}
