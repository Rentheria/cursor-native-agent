import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldNotifyCronResult,
  formatCronNotification,
  parseTelegramChatIds,
  getTelegramNotifyConfig,
  TELEGRAM_BOT_TOKEN_ENV,
  TELEGRAM_ALLOWED_CHAT_IDS_ENV,
} from './cron-notify.js';
import type { CronTickReport } from './cron-tick.js';
import type { RepoHealthSnapshot, HealthIssue, HealthDelta } from './repo-health.js';

function createTestSnapshot(overrides?: Partial<RepoHealthSnapshot>): RepoHealthSnapshot {
  return {
    collectedAt: '2026-08-22T09:00:00.000Z',
    branch: 'main',
    head: 'abc123def456',
    dirtyPaths: [],
    gitError: null,
    indexedMemoryPaths: [],
    memoryDocuments: [],
    skillDocuments: [],
    issues: [],
    ...overrides,
  };
}

function createTestIssue(severity: 'error' | 'warn', message: string): HealthIssue {
  return {
    id: `test-${severity}-${message.slice(0, 20)}`,
    severity,
    message,
  };
}

function createTestDelta(overrides?: Partial<HealthDelta>): HealthDelta {
  return {
    previousCollectedAt: null,
    previousHead: null,
    headChanged: false,
    newIssues: [],
    resolvedIssues: [],
    changedIssues: [],
    ...overrides,
  };
}

describe('cron-notify', () => {
  describe('shouldNotifyCronResult', () => {
    it('retorna false cuando el veredicto es READY', () => {
      const report: CronTickReport = {
        startedAt: '2026-08-22T09:00:00.000Z',
        finishedAt: '2026-08-22T09:00:05.000Z',
        exitCode: 0,
        snapshot: createTestSnapshot(),
        delta: createTestDelta(),
        triage: {
          finding: undefined,
          action: undefined,
        },
      };

      assert.strictEqual(shouldNotifyCronResult(report), false);
    });

    it('retorna true cuando hay errores', () => {
      const report: CronTickReport = {
        startedAt: '2026-08-22T09:00:00.000Z',
        finishedAt: '2026-08-22T09:00:05.000Z',
        exitCode: 0,
        snapshot: createTestSnapshot({
          issues: [
            createTestIssue('error', 'Missing frontmatter in memory/test.md'),
          ],
        }),
        delta: createTestDelta(),
        triage: {
          finding: 'Missing frontmatter',
          action: 'Add frontmatter to memory/test.md',
        },
      };

      assert.strictEqual(shouldNotifyCronResult(report), true);
    });

    it('retorna true cuando hay warnings', () => {
      const report: CronTickReport = {
        startedAt: '2026-08-22T09:00:00.000Z',
        finishedAt: '2026-08-22T09:00:05.000Z',
        exitCode: 0,
        snapshot: createTestSnapshot({
          dirtyPaths: ['src/test.ts'],
          issues: [
            createTestIssue('warn', 'Working tree is dirty'),
          ],
        }),
        delta: createTestDelta(),
        triage: {
          finding: 'Uncommitted changes',
          action: 'Commit or stash changes',
        },
      };

      assert.strictEqual(shouldNotifyCronResult(report), true);
    });
  });

  describe('formatCronNotification', () => {
    it('formatea mensaje con veredicto BROKEN', () => {
      const issue = createTestIssue('error', 'Missing frontmatter');
      const report: CronTickReport = {
        startedAt: '2026-08-22T09:00:00.000Z',
        finishedAt: '2026-08-22T09:00:05.000Z',
        exitCode: 0,
        snapshot: createTestSnapshot({
          branch: 'feat/test',
          head: 'abc123def456789',
          issues: [issue],
        }),
        delta: createTestDelta({
          newIssues: [issue],
        }),
        triage: {
          finding: 'Missing frontmatter in memory/test.md',
          action: 'Add required frontmatter fields',
        },
      };

      const message = formatCronNotification(report);
      assert.ok(message.includes('cursor-native-agent cron tick'));
      assert.ok(message.includes('BROKEN'));
      assert.ok(message.includes('feat/test'));
      assert.ok(message.includes('abc123d'));
      assert.ok(message.includes('Missing frontmatter'));
      assert.ok(message.includes('Add required frontmatter'));
    });

    it('incluye detalles de delta cuando hay cambios', () => {
      const newIssue = createTestIssue('warn', 'New warning');
      const resolvedIssue = createTestIssue('error', 'Old error');
      const report: CronTickReport = {
        startedAt: '2026-08-22T09:00:00.000Z',
        finishedAt: '2026-08-22T09:00:05.000Z',
        exitCode: 0,
        snapshot: createTestSnapshot({
          issues: [],
        }),
        delta: createTestDelta({
          newIssues: [newIssue],
          resolvedIssues: [resolvedIssue],
          headChanged: true,
        }),
        triage: {
          finding: undefined,
          action: undefined,
        },
      };

      const message = formatCronNotification(report);
      assert.ok(message.includes('New:'));
      assert.ok(message.includes('Resolved:'));
    });
  });

  describe('parseTelegramChatIds', () => {
    it('retorna array vacío cuando raw es undefined', () => {
      const ids = parseTelegramChatIds(undefined);
      assert.deepStrictEqual(ids, []);
    });

    it('retorna array vacío cuando raw es string vacío', () => {
      const ids = parseTelegramChatIds('');
      assert.deepStrictEqual(ids, []);
    });

    it('parsea IDs separados por comas', () => {
      const ids = parseTelegramChatIds('123456789,-1009876543210');
      assert.deepStrictEqual(ids, [123456789, -1009876543210]);
    });

    it('parsea IDs separados por espacios', () => {
      const ids = parseTelegramChatIds('123 456 789');
      assert.deepStrictEqual(ids, [123, 456, 789]);
    });

    it('lanza error cuando hay token inválido', () => {
      assert.throws(
        () => parseTelegramChatIds('123,abc,456'),
        /not a valid Telegram numeric ID/,
      );
    });
  });

  describe('getTelegramNotifyConfig', () => {
    it('retorna undefined cuando no hay token', () => {
      const config = getTelegramNotifyConfig({});
      assert.strictEqual(config, undefined);
    });

    it('retorna undefined cuando token es string vacío', () => {
      const config = getTelegramNotifyConfig({
        [TELEGRAM_BOT_TOKEN_ENV]: '',
      });
      assert.strictEqual(config, undefined);
    });

    it('retorna undefined cuando no hay chat IDs', () => {
      const config = getTelegramNotifyConfig({
        [TELEGRAM_BOT_TOKEN_ENV]: 'test-token',
        [TELEGRAM_ALLOWED_CHAT_IDS_ENV]: '',
      });
      assert.strictEqual(config, undefined);
    });

    it('retorna configuración cuando token y chat IDs están presentes', () => {
      const config = getTelegramNotifyConfig({
        [TELEGRAM_BOT_TOKEN_ENV]: 'test-token',
        [TELEGRAM_ALLOWED_CHAT_IDS_ENV]: '123,456',
      });

      assert.ok(config !== undefined);
      assert.strictEqual(config.token, 'test-token');
      assert.deepStrictEqual(config.allowedChatIds, [123, 456]);
    });

    it('trimea el token', () => {
      const config = getTelegramNotifyConfig({
        [TELEGRAM_BOT_TOKEN_ENV]: '  test-token  ',
        [TELEGRAM_ALLOWED_CHAT_IDS_ENV]: '123',
      });

      assert.ok(config !== undefined);
      assert.strictEqual(config.token, 'test-token');
    });
  });
});
