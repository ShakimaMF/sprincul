/// <reference lib="dom" />
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import Sprincul from '../../src/Sprincul.ts';
import { waitForDomUpdate } from '../helpers.ts';

describe('Sprincul.store', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    Sprincul.store.clear();
  });

  test('get returns undefined for missing key', () => {
    expect(Sprincul.store.get('missing')).toBeUndefined();
  });

  test('set and get value', () => {
    Sprincul.store.set('theme', 'dark');
    expect(Sprincul.store.get('theme')).toBe('dark');
  });

  test('subscribe fires only after the first change', async () => {
    const seen: Array<string | undefined> = [];

    const unsub = Sprincul.store.subscribe<string>('k', (value) => {
      seen.push(value);
    });

    expect(seen.length).toBe(0);

    Sprincul.store.set('k', 'v1');
    await waitForDomUpdate();
    expect(seen.includes('v1')).toBe(true);

    Sprincul.store.set('k', 'v2');
    await waitForDomUpdate();
    expect(seen.includes('v2')).toBe(true);

    unsub();
  });

  test('clear removes all store entries', () => {
    Sprincul.store.set('key1', 'value1');
    Sprincul.store.set('key2', 'value2');
    Sprincul.store.set('key3', 123);

    expect(Sprincul.store.get('key1')).toBe('value1');
    expect(Sprincul.store.get('key2')).toBe('value2');
    expect(Sprincul.store.get('key3')).toBe(123);

    Sprincul.store.clear();

    expect(Sprincul.store.get('key1')).toBeUndefined();
    expect(Sprincul.store.get('key2')).toBeUndefined();
    expect(Sprincul.store.get('key3')).toBeUndefined();
  });
});
