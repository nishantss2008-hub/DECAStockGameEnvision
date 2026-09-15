/** Storage accessors that never throw (private mode, blocked site data, sandboxed previews). */
const noop: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

export function sessionStore(): Storage {
  try {
    return window.sessionStorage ?? noop;
  } catch {
    return noop;
  }
}

export function localStore(): Storage {
  try {
    return window.localStorage ?? noop;
  } catch {
    return noop;
  }
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches === true || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}
