/**
 * Client order ids. Every Place order press sends a fresh id; the server stores the order at
 * `orders/{teamId}_{clientOrderId}`, so retrying the same id never charges twice.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'; // 64 symbols
const LENGTH = 20;

/** 20 URL-safe characters ([A-Za-z0-9_-]) from crypto.getRandomValues (120 bits, unbiased). */
export function newClientOrderId(): string {
  const bytes = new Uint8Array(LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (const b of bytes) id += ALPHABET[b & 63];
  return id;
}

/**
 * Short order number for receipts, Activity rows and `/portfolio/activity/:orderId`:
 * 'BX-' + the first 6 characters, uppercased ('BX-7Q2F9K'). Display only; match orders by
 * comparing `orderNumber(order.clientOrderId)` with the route parameter.
 */
export function orderNumber(clientOrderId: string): string {
  return `BX-${clientOrderId.slice(0, 6).toUpperCase()}`;
}
