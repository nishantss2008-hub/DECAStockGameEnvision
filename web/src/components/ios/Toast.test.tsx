import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WifiOff } from 'lucide-react';
import { ToastProvider, toastTimeout, useAnnounce, useToast, TOAST_MIN_TIMEOUT_MS, type ToastOptions } from './Toast';
import { Banner } from './Banner';
import { Sheet } from './Sheet';

function ShowButton({ options, label = 'Show' }: { options: ToastOptions; label?: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      {label}
    </button>
  );
}

const liveRegion = () => document.querySelector('[role="status"][aria-live="polite"]');

describe('toastTimeout', () => {
  it('keeps info toasts at least 6 seconds and action toasts until dismissed', () => {
    expect(TOAST_MIN_TIMEOUT_MS).toBe(6000);
    expect(toastTimeout({ hasAction: false })).toBe(6000);
    expect(toastTimeout({ hasAction: false, timeoutMs: 2000 })).toBe(6000);
    expect(toastTimeout({ hasAction: false, timeoutMs: 9000 })).toBe(9000);
    expect(toastTimeout({ hasAction: false, timeoutMs: 0 })).toBe(0);
    expect(toastTimeout({ hasAction: true, timeoutMs: 9000 })).toBe(0);
  });
});

describe('Toast', () => {
  it('shows a silent toast with an icon and a labelled Close button', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ShowButton options={{ title: 'Back online', icon: WifiOff }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(await screen.findByText('Back online')).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region).toHaveAttribute('aria-live', 'off');
    await new Promise((r) => setTimeout(r, 80));
    expect(liveRegion()).toHaveTextContent('');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByText('Back online')).not.toBeInTheDocument());
  });

  it('runs the action and dismisses', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    render(
      <ToastProvider>
        <ShowButton options={{ title: 'Update ready', action: { label: 'Reload', onAction: reload } }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show' }));
    await user.click(await screen.findByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Update ready')).not.toBeInTheDocument());
  });

  it('announces politely only when asked for an order result or phase change', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ShowButton options={{ title: 'Order filled: Bought 50 KRKN at Ð84.12 (Ð4,206.00).', announce: 'order' }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show' }));
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Order filled: Bought 50 KRKN'));
    expect(liveRegion()).toHaveAttribute('data-inert-exempt');
  });

  it('keeps the announcer reachable while a sheet makes the page inert', async () => {
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    document.body.appendChild(appRoot);
    function Ticket() {
      const announce = useAnnounce();
      return (
        <Sheet open title="Buy KRKN" onOpenChange={() => {}}>
          <button type="button" onClick={() => announce('Order filled: Bought 500 KRKN at Ð84.12 (Ð42,102.06).', 'order')}>
            Place order
          </button>
        </Sheet>
      );
    }
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Ticket />
      </ToastProvider>,
      { container: appRoot },
    );
    await screen.findByRole('dialog', { name: 'Buy KRKN' });
    await waitFor(() => expect(appRoot).toHaveAttribute('inert'));
    await user.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Order filled: Bought 500 KRKN'));
    expect(liveRegion()?.closest('[inert]')).toBeNull();
    appRoot.remove();
  });

  it('useAnnounce is a no-op without a provider', () => {
    function Speaker() {
      const announce = useAnnounce();
      return (
        <button type="button" onClick={() => announce('Trading paused', 'phase')}>
          Speak
        </button>
      );
    }
    render(<Speaker />);
    act(() => screen.getByRole('button', { name: 'Speak' }).click());
    expect(liveRegion()).toBeNull();
  });
});

describe('Banner', () => {
  it('renders title, flavor, body and a small action', async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    render(
      <Banner
        tone="stale"
        title="Prices may be out of date"
        body="The last price update was 2 minutes ago. Wait a moment, or tap Reload."
        action={{ label: 'Reload', onClick: onReload }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Prices may be out of date' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalled();
  });

  it('announces a phase change politely', async () => {
    render(
      <ToastProvider>
        <Banner
          tone="paused"
          title="Trading paused"
          flavor="Becalmed"
          body="The host paused the market at tick 1,284."
          announce="phase"
        />
      </ToastProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Trading paused · Becalmed' })).toBeInTheDocument();
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Trading paused. The host paused the market at tick 1,284.'));
  });

  it('stays silent without announce', async () => {
    render(
      <ToastProvider>
        <Banner tone="lobby" title="Market not open yet" body="Trading opens when the host starts the game." />
      </ToastProvider>,
    );
    await new Promise((r) => setTimeout(r, 80));
    expect(liveRegion()).toHaveTextContent('');
  });
});
