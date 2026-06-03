export const CHATTER_REFRESH_EVENT = 'chatter:refresh';

export type ChatterRefreshDetail = {
  taskId?: string | null;
  projectId?: string | null;
  postId?: string | null;
};

export function emitChatterRefresh(detail?: ChatterRefreshDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHATTER_REFRESH_EVENT, { detail: detail ?? {} }));
}

export function onChatterRefresh(handler: (detail: ChatterRefreshDetail) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<ChatterRefreshDetail>;
    handler(custom.detail ?? {});
  };
  window.addEventListener(CHATTER_REFRESH_EVENT, listener);
  return () => window.removeEventListener(CHATTER_REFRESH_EVENT, listener);
}
