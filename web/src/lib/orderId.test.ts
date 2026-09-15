import { describe, it, expect } from 'vitest';
import { newClientOrderId, orderNumber } from './orderId';

describe('newClientOrderId', () => {
  it('is 20 URL-safe characters accepted by the server schema', () => {
    for (let i = 0; i < 200; i++) {
      const id = newClientOrderId();
      expect(id).toMatch(/^[A-Za-z0-9_-]{20}$/);
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/); // shared/src/schemas.ts orderSchema
    }
  });
  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newClientOrderId()));
    expect(ids.size).toBe(2000);
  });
});

describe('orderNumber', () => {
  it('shows a short uppercase order number for receipts and routes', () => {
    expect(orderNumber('7q2f9kAbCdEfGhIjKlMn')).toBe('BX-7Q2F9K');
    expect(orderNumber('ab')).toBe('BX-AB');
  });
});
