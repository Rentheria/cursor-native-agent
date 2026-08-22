import { describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  setPendingDashboardForce,
  consumePendingDashboardForce,
  hasPendingDashboardForce,
  cancelPendingDashboardForce,
  setPendingTelegramForce,
  consumePendingTelegramForce,
  hasPendingTelegramForce,
  cancelPendingTelegramForce,
  cleanupExpiredEntries,
} from './pending-force.js';

describe('pending-force', () => {
  test('dashboard: set and consume pending prompt', () => {
    setPendingDashboardForce('haz una app de calculadora');
    assert.equal(hasPendingDashboardForce(), true);
    const prompt = consumePendingDashboardForce();
    assert.equal(prompt, 'haz una app de calculadora');
    assert.equal(hasPendingDashboardForce(), false);
  });

  test('dashboard: cancel pending prompt', () => {
    setPendingDashboardForce('crea un sitio web');
    assert.equal(hasPendingDashboardForce(), true);
    cancelPendingDashboardForce();
    assert.equal(hasPendingDashboardForce(), false);
    assert.equal(consumePendingDashboardForce(), undefined);
  });

  test('dashboard: expired entry returns undefined', () => {
    setPendingDashboardForce('build an app', 10);
    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    return delay(20).then(() => {
      assert.equal(hasPendingDashboardForce(), false);
      assert.equal(consumePendingDashboardForce(), undefined);
    });
  });

  test('telegram: set and consume per chatId', () => {
    setPendingTelegramForce(123, 'haz una calculadora');
    setPendingTelegramForce(456, 'crea un tracker');
    assert.equal(hasPendingTelegramForce(123), true);
    assert.equal(hasPendingTelegramForce(456), true);
    assert.equal(consumePendingTelegramForce(123), 'haz una calculadora');
    assert.equal(hasPendingTelegramForce(123), false);
    assert.equal(hasPendingTelegramForce(456), true);
    assert.equal(consumePendingTelegramForce(456), 'crea un tracker');
    assert.equal(hasPendingTelegramForce(456), false);
  });

  test('telegram: cancel pending', () => {
    setPendingTelegramForce(789, 'build a game');
    assert.equal(hasPendingTelegramForce(789), true);
    cancelPendingTelegramForce(789);
    assert.equal(hasPendingTelegramForce(789), false);
  });

  test('telegram: expired entry returns undefined', () => {
    setPendingTelegramForce(999, 'short-lived', 10);
    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    return delay(20).then(() => {
      assert.equal(hasPendingTelegramForce(999), false);
      assert.equal(consumePendingTelegramForce(999), undefined);
    });
  });

  test('cleanup removes all expired entries', () => {
    setPendingDashboardForce('dashboard prompt', 5);
    setPendingTelegramForce(111, 'tg prompt 1', 5);
    setPendingTelegramForce(222, 'tg prompt 2', 10000);
    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    return delay(15).then(() => {
      cleanupExpiredEntries();
      assert.equal(hasPendingDashboardForce(), false);
      assert.equal(hasPendingTelegramForce(111), false);
      assert.equal(hasPendingTelegramForce(222), true);
    });
  });
});
