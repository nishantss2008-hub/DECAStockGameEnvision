import { describe, it, expect } from 'vitest';
import { ticketReducer, initialTicket, quantityFrom, isStale } from './useTicketState';
describe('ticket state', () => {
  const s0 = initialTicket('abcdefgh12', 'kraken');
  it('moves entry → preview → placing → filled and keeps the clientOrderId until reset', () => {
    let s = ticketReducer(s0, { type: 'setInput', input: '500' });
    s = ticketReducer(s, { type: 'preview', price: 8412, tick: 1284 }); expect(s.stage).toBe('preview'); expect(s.quotedPrice).toBe(8412);
    s = ticketReducer(s, { type: 'placing' }); expect(s.stage).toBe('placing');
    s = ticketReducer(s, { type: 'filled', trade: { id: 't' } as any }); expect(s.stage).toBe('filled'); expect(s.clientOrderId).toBe('abcdefgh12');
    s = ticketReducer(s, { type: 'reset', clientOrderId: 'zzzzzzzz99' }); expect(s.stage).toBe('entry'); expect(s.input).toBe(''); expect(s.clientOrderId).toBe('zzzzzzzz99');
  });
  it('edit returns to entry keeping input; rejected keeps error', () => {
    let s = ticketReducer({ ...s0, input: '5', stage: 'preview' }, { type: 'edit' }); expect(s.stage).toBe('entry'); expect(s.input).toBe('5');
    s = ticketReducer(s, { type: 'rejected', code: 'insufficient_funds', message: 'x' }); expect(s.stage).toBe('rejected'); expect(s.error?.code).toBe('insufficient_funds');
  });
  it('quantity from shares or amount', () => {
    expect(quantityFrom({ ...s0, input: '12' }, 8412, 1, 242e6, 10)).toBe(12);
    expect(quantityFrom({ ...s0, mode: 'amount', input: '5000' }, 8412, 1, 242e6, 10)).toBe(59);
    expect(quantityFrom({ ...s0, input: 'abc' }, 8412, 1, 242e6, 10)).toBe(0);
  });
  it('staleness uses the 2% protection band', () => {
    expect(isStale({ ...s0, quotedPrice: 10_000 }, 10_200)).toBe(false); expect(isStale({ ...s0, quotedPrice: 10_000 }, 10_201)).toBe(true);
  });
});
