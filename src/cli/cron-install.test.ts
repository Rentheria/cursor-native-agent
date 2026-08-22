import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCronLine,
  uninstallCrontab,
  DEFAULT_CRON_SCHEDULE,
} from './cron-install.js';

describe('cron-install', () => {
  describe('buildCronLine', () => {
    it('genera línea de cron con valores por defecto', () => {
      const line = buildCronLine({
        repoRoot: '/home/user/repo',
      });
      assert.ok(line.includes(DEFAULT_CRON_SCHEDULE));
      assert.ok(line.includes('/home/user/repo/scripts/cron-tick.sh'));
      assert.ok(line.includes('--check-only'));
      assert.ok(line.includes('/home/user/repo/logs/cron.stdout.log'));
    });

    it('genera línea de cron con schedule personalizado', () => {
      const line = buildCronLine({
        repoRoot: '/opt/agent',
        schedule: '*/30 * * * *',
      });
      assert.ok(line.includes('*/30 * * * *'));
      assert.ok(line.includes('/opt/agent/scripts/cron-tick.sh'));
    });

    it('omite --check-only cuando checkOnly es false', () => {
      const line = buildCronLine({
        repoRoot: '/home/user/repo',
        checkOnly: false,
      });
      assert.ok(!line.includes('--check-only'));
    });
  });

  describe('installCrontab', () => {
    it('genera mensaje con la línea de cron esperada', () => {
      const line = buildCronLine({
        repoRoot: '/test/repo',
      });
      assert.ok(line.startsWith(DEFAULT_CRON_SCHEDULE));
      assert.ok(line.includes('--check-only'));
    });
  });

  describe('uninstallCrontab', () => {
    it('reporta cuando no hay crontab instalado', async () => {
      const result = await uninstallCrontab('/nonexistent/repo');
      assert.strictEqual(result.success, false);
      assert.ok(
        result.message.includes('No crontab found') ||
        result.message.includes('crontab command not found') ||
        result.message.includes('No cron job found'),
      );
    });
  });
});
