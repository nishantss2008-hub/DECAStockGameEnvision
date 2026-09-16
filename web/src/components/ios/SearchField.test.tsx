import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchField } from './SearchField';

function Harness(props: { onCancel?: () => void; onSubmit?: (v: string) => void; announcement?: (v: string) => string }) {
  const [value, setValue] = useState('');
  return (
    <SearchField
      value={value}
      onChange={setValue}
      placeholder="Search companies and funds"
      onCancel={props.onCancel}
      onSubmit={props.onSubmit}
      announcement={props.announcement ? props.announcement(value) : undefined}
    />
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SearchField', () => {
  it('is a search landmark with a labelled search input tuned for phones', () => {
    render(<Harness />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    const input = screen.getByRole('searchbox', { name: 'Search companies and funds' });
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveAttribute('enterkeyhint', 'search');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it('shows a Clear button once there is text and clears back into the field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    const input = screen.getByRole('searchbox');
    await user.type(input, 'krkn');
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('shows Cancel while focused; Cancel clears, leaves the field and calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    const input = screen.getByRole('searchbox');
    await user.click(input);
    await user.keyboard('port');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input).toHaveValue('');
    expect(input).not.toHaveFocus();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('keeps Cancel reachable with Tab from an empty field', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('searchbox'));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('clears with Escape, then cancels with a second Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    const input = screen.getByRole('searchbox');
    await user.click(input);
    await user.keyboard('salt');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
    expect(onCancel).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('submits without reloading the page', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByRole('searchbox'), 'KRKN{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('KRKN');
  });

  it('announces the result count politely after 500ms of idle typing', () => {
    vi.useFakeTimers();
    render(<Harness announcement={(v) => (v ? `${v.length} results` : '')} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'a' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(status).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(status).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(status).toHaveTextContent('2 results');
  });

  it('names the search landmark like its field, so two searches on a page stay distinct', () => {
    render(<SearchField value="" onChange={() => {}} placeholder="Search companies and funds" label="Choose a company" />);
    expect(screen.getByRole('search', { name: 'Choose a company' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Choose a company' })).toBeInTheDocument();
  });

  it('focuses the field when the capsule around the input is tapped (44px hit area, MOBILE §4.4)', () => {
    const { container } = render(<Harness />);
    const capsule = container.querySelector('.ios-search__field') as HTMLElement;
    fireEvent.click(capsule);
    expect(screen.getByRole('searchbox')).toHaveFocus();
  });
});
