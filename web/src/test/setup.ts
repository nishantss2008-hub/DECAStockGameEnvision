/**
 * Shared vitest setup for the web workspace.
 *
 * - Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveAccessibleName, ...).
 * - Unmounts React trees after each DOM test (vitest runs without globals, so
 *   @testing-library/react cannot register its own cleanup).
 * - Adds guarded stubs for browser APIs that jsdom lacks but the iOS components
 *   use (matchMedia for reduced motion / transparency / contrast, ResizeObserver
 *   for charts, pointer capture and scrollIntoView for sheets and lists).
 *   Tests that need specific behaviour should override these with vi.spyOn / vi.stubGlobal.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (typeof window.ResizeObserver === 'undefined') {
    class ResizeObserverStub implements ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: ResizeObserverStub,
    });
  }

  const proto = window.HTMLElement.prototype;
  if (typeof proto.scrollIntoView !== 'function') proto.scrollIntoView = () => {};
  if (typeof proto.hasPointerCapture !== 'function') proto.hasPointerCapture = () => false;
  if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = () => {};
  if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = () => {};

  afterEach(async () => {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  });
}
