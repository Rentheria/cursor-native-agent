import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  resolveBudgetConfig,
  recordCost,
  getUsageStats,
  checkBudgetExceeded,
  type CostEntry,
  type BudgetConfig,
} from './cost-tracker.js';

describe('resolveBudgetConfig', () => {
  test('returns defaults when env vars are not set', () => {
    const config = resolveBudgetConfig({});
    assert.equal(config.dailyLimitMs, 3_600_000);
    assert.equal(config.hourlyLimitMs, 600_000);
    assert.equal(config.perSessionLimitMs, 300_000);
  });

  test('parses valid env vars', () => {
    const config = resolveBudgetConfig({
      CURSOR_AGENT_DAILY_LIMIT_MS: '7200000',
      CURSOR_AGENT_HOURLY_LIMIT_MS: '1200000',
      CURSOR_AGENT_SESSION_LIMIT_MS: '600000',
    });
    assert.equal(config.dailyLimitMs, 7_200_000);
    assert.equal(config.hourlyLimitMs, 1_200_000);
    assert.equal(config.perSessionLimitMs, 600_000);
  });

  test('ignores invalid env vars', () => {
    const config = resolveBudgetConfig({
      CURSOR_AGENT_DAILY_LIMIT_MS: 'invalid',
      CURSOR_AGENT_HOURLY_LIMIT_MS: '-100',
      CURSOR_AGENT_SESSION_LIMIT_MS: '0',
    });
    assert.equal(config.dailyLimitMs, 3_600_000);
    assert.equal(config.hourlyLimitMs, 600_000);
    assert.equal(config.perSessionLimitMs, 300_000);
  });
});

describe('recordCost and getUsageStats', () => {
  test('records cost and retrieves stats', async () => {
    const tmpDirPath = path.join(tmpdir(), `cost-test-${Date.now()}`);
    await mkdir(tmpDirPath, { recursive: true });
    const tmpDir = tmpDirPath;
    
    try {
      const entry: CostEntry = {
        timestamp: Date.now(),
        channel: 'cli',
        model: 'composer-2.5-fast',
        durationMs: 5000,
      };

      await recordCost(tmpDir, entry);

      const budget: BudgetConfig = {
        dailyLimitMs: 3_600_000,
        hourlyLimitMs: 600_000,
        perSessionLimitMs: 300_000,
      };

      const stats = await getUsageStats(tmpDir, budget);
      
      assert.equal(stats.hourlyUsageMs, 5000);
      assert.equal(stats.dailyUsageMs, 5000);
      assert.equal(stats.remainingHourlyMs, 595_000);
      assert.equal(stats.remainingDailyMs, 3_595_000);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('filters old entries correctly', async () => {
    const tmpDirPath = path.join(tmpdir(), `cost-test-${Date.now()}`);
    await mkdir(tmpDirPath, { recursive: true });
    const tmpDir = tmpDirPath;
    
    try {
      const now = Date.now();
      const twoHoursAgo = now - 7_200_000;
      const thirtyMinutesAgo = now - 1_800_000;

      const oldEntry: CostEntry = {
        timestamp: twoHoursAgo,
        channel: 'cli',
        model: 'composer-2.5-fast',
        durationMs: 10000,
      };

      const recentEntry: CostEntry = {
        timestamp: thirtyMinutesAgo,
        channel: 'dashboard',
        model: 'composer-2.5-fast',
        durationMs: 5000,
      };

      await recordCost(tmpDir, oldEntry);
      await recordCost(tmpDir, recentEntry);

      const budget: BudgetConfig = {
        dailyLimitMs: 3_600_000,
        hourlyLimitMs: 600_000,
        perSessionLimitMs: 300_000,
      };

      const stats = await getUsageStats(tmpDir, budget);
      
      assert.equal(stats.hourlyUsageMs, 5000);
      assert.equal(stats.dailyUsageMs, 15000);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('handles empty log file', async () => {
    const tmpDirPath = path.join(tmpdir(), `cost-test-${Date.now()}`);
    await mkdir(tmpDirPath, { recursive: true });
    const tmpDir = tmpDirPath;
    
    try {
      const budget: BudgetConfig = {
        dailyLimitMs: 3_600_000,
        hourlyLimitMs: 600_000,
        perSessionLimitMs: 300_000,
      };

      const stats = await getUsageStats(tmpDir, budget);
      
      assert.equal(stats.hourlyUsageMs, 0);
      assert.equal(stats.dailyUsageMs, 0);
      assert.equal(stats.remainingHourlyMs, 600_000);
      assert.equal(stats.remainingDailyMs, 3_600_000);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('checkBudgetExceeded', () => {
  test('returns exceeded when hourly limit reached', () => {
    const result = checkBudgetExceeded({
      hourlyUsageMs: 600_000,
      dailyUsageMs: 600_000,
      sessionUsageMs: 100_000,
      remainingHourlyMs: 0,
      remainingDailyMs: 3_000_000,
      remainingSessionMs: 200_000,
    });
    
    assert.equal(result.exceeded, true);
    assert.equal(result.reason, 'hourly limit exceeded');
  });

  test('returns exceeded when daily limit reached', () => {
    const result = checkBudgetExceeded({
      hourlyUsageMs: 100_000,
      dailyUsageMs: 3_600_000,
      sessionUsageMs: 100_000,
      remainingHourlyMs: 500_000,
      remainingDailyMs: 0,
      remainingSessionMs: 200_000,
    });
    
    assert.equal(result.exceeded, true);
    assert.equal(result.reason, 'daily limit exceeded');
  });

  test('returns not exceeded when within limits', () => {
    const result = checkBudgetExceeded({
      hourlyUsageMs: 100_000,
      dailyUsageMs: 500_000,
      sessionUsageMs: 50_000,
      remainingHourlyMs: 500_000,
      remainingDailyMs: 3_100_000,
      remainingSessionMs: 250_000,
    });
    
    assert.equal(result.exceeded, false);
    assert.equal(result.reason, undefined);
  });
});
