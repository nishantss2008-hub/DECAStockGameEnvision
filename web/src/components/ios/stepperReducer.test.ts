import { describe, it, expect } from 'vitest';
import { clampStep, stepperReducer, canDecrement, canIncrement, type StepperState } from './stepperReducer';

const st = (value: number, min = 0, max = 100, step = 1): StepperState => ({ value, min, max, step });

describe('clampStep', () => {
  it('keeps a value inside the bounds', () => {
    expect(clampStep(5, 0, 10)).toBe(5);
    expect(clampStep(-3, 0, 10)).toBe(0);
    expect(clampStep(42, 0, 10)).toBe(10);
  });

  it('removes floating point noise using the step precision', () => {
    expect(clampStep(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
    expect(clampStep(0.7 + 0.1, 0, 1, 0.1)).toBe(0.8);
    expect(clampStep(1.1 * 3, 0, 10, 0.01)).toBe(3.3);
  });

  it('falls back to the minimum for non-finite input', () => {
    expect(clampStep(Number.NaN, 2, 10)).toBe(2);
    expect(clampStep(Number.POSITIVE_INFINITY, 2, 10)).toBe(10);
  });

  it('treats an unbounded max as Infinity', () => {
    expect(clampStep(1_000_000, 0, Number.POSITIVE_INFINITY)).toBe(1_000_000);
  });
});

describe('stepperReducer', () => {
  it('increments and decrements by the step', () => {
    expect(stepperReducer(st(10, 0, 1000, 100), { type: 'increment' }).value).toBe(110);
    expect(stepperReducer(st(510, 0, 1000, 100), { type: 'decrement' }).value).toBe(410);
    expect(stepperReducer(st(3), { type: 'increment' }).value).toBe(4);
  });

  it('clamps at the bounds', () => {
    expect(stepperReducer(st(100), { type: 'increment' }).value).toBe(100);
    expect(stepperReducer(st(0), { type: 'decrement' }).value).toBe(0);
    expect(stepperReducer(st(950, 0, 1000, 100), { type: 'increment' }).value).toBe(1000);
    expect(stepperReducer(st(50, 0, 1000, 100), { type: 'decrement' }).value).toBe(0);
  });

  it('sets a typed value and clamps it', () => {
    expect(stepperReducer(st(3), { type: 'set', value: 42 }).value).toBe(42);
    expect(stepperReducer(st(3), { type: 'set', value: 420 }).value).toBe(100);
    expect(stepperReducer(st(3), { type: 'set', value: Number.NaN }).value).toBe(3);
  });

  it('returns the same state when the value does not change', () => {
    const state = st(100);
    expect(stepperReducer(state, { type: 'increment' })).toBe(state);
  });

  it('never steps by zero or a negative step', () => {
    expect(stepperReducer(st(5, 0, 10, 0), { type: 'increment' }).value).toBe(6);
    expect(stepperReducer(st(5, 0, 10, -2), { type: 'increment' }).value).toBe(6);
  });
});

describe('canDecrement / canIncrement', () => {
  it('reports whether each half can act', () => {
    expect(canDecrement(st(0))).toBe(false);
    expect(canDecrement(st(1))).toBe(true);
    expect(canIncrement(st(100))).toBe(false);
    expect(canIncrement(st(99))).toBe(true);
  });
});
