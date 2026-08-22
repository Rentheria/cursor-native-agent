import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  detectDocumentsFolder,
  getDefaultWorkspacePath,
  shouldSkipOnboarding,
  getDefaultConfig,
  writeEnvFile,
  ensureWorkspaceExists,
  ensureDefaultConfig,
  generateDashboardToken,
  type OnboardingOptions,
} from './onboarding.js';

describe('onboarding', () => {
  describe('detectDocumentsFolder', () => {
    it('returns a path containing Documents or Documentos', () => {
      const folder = detectDocumentsFolder();
      assert.ok(
        folder.includes('Documents') || folder.includes('Documentos'),
        `Expected folder to contain Documents or Documentos, got: ${folder}`,
      );
    });

    it('creates Documents folder if neither exists', () => {
      const folder = detectDocumentsFolder();
      assert.ok(existsSync(folder), 'Documents folder should exist after detection');
    });
  });

  describe('getDefaultWorkspacePath', () => {
    it('returns empty string (defaults to repo workspace)', () => {
      const workspacePath = getDefaultWorkspacePath();
      assert.strictEqual(
        workspacePath,
        '',
        'Default workspace path should be empty (resolves to <repo>/workspace)',
      );
    });
  });

  describe('shouldSkipOnboarding', () => {
    it('skips when skipOnboarding option is true', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const options: OnboardingOptions = {
          repoRoot: tmpRoot,
          skipOnboarding: true,
          env: {},
        };
        assert.strictEqual(shouldSkipOnboarding(options), true);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('skips when CURSOR_NATIVE_AGENT_SKIP_ONBOARD=1', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const options: OnboardingOptions = {
          repoRoot: tmpRoot,
          env: { CURSOR_NATIVE_AGENT_SKIP_ONBOARD: '1' },
        };
        assert.strictEqual(shouldSkipOnboarding(options), true);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('skips when CI=true', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const options: OnboardingOptions = {
          repoRoot: tmpRoot,
          env: { CI: 'true' },
        };
        assert.strictEqual(shouldSkipOnboarding(options), true);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('skips when .env exists with onboarding marker', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const envPath = path.join(tmpRoot, '.env');
        writeFileSync(envPath, 'CURSOR_NATIVE_AGENT_ONBOARDED=1\n', 'utf8');
        const options: OnboardingOptions = {
          repoRoot: tmpRoot,
          env: {},
        };
        assert.strictEqual(shouldSkipOnboarding(options), true);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('does not skip when .env exists without onboarding marker', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const envPath = path.join(tmpRoot, '.env');
        writeFileSync(envPath, 'SOME_OTHER_VAR=value\n', 'utf8');
        const options: OnboardingOptions = {
          repoRoot: tmpRoot,
          skipOnboarding: false,
          env: {},
        };
        const result = shouldSkipOnboarding(options);
        assert.ok(!result, 'should not skip onboarding when marker is missing');
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('getDefaultConfig', () => {
    it('returns expected defaults', () => {
      const config = getDefaultConfig();
      assert.strictEqual(config.CURSOR_AGENT_MODEL, 'composer-2.5-fast');
      assert.strictEqual(config.PORT, '3847');
      assert.strictEqual(config.CURSOR_NATIVE_AGENT_DASHBOARD_CHAT, '1');
      assert.strictEqual(config.CURSOR_NATIVE_AGENT_SEMANTIC_MEMORY, '1');
      assert.strictEqual(config.CURSOR_NATIVE_AGENT_SEMANTIC_TOP_K, '3');
      assert.strictEqual(config.CURSOR_NATIVE_AGENT_SEMANTIC_THRESHOLD, '0.12');
      assert.strictEqual(config.CURSOR_NATIVE_AGENT_EMBEDDINGS_PROVIDER, 'local');
      assert.strictEqual(config.TELEGRAM_BOT_TOKEN, '');
      assert.strictEqual(config.TELEGRAM_ALLOWED_CHAT_IDS, '');
      assert.strictEqual(config.CURSOR_NATIVE_AGENT_DEBUG, '0');
      assert.strictEqual(config.CURSOR_NATIVE_AGENT_ONBOARDED, '1');
      assert.strictEqual(
        config.WORKSPACE_PATH,
        '',
        'Default workspace path should be empty (resolves to <repo>/workspace)',
      );
    });
  });

  describe('writeEnvFile', () => {
    it('writes .env file with all settings', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const config = getDefaultConfig();
        writeEnvFile(tmpRoot, config);
        const envPath = path.join(tmpRoot, '.env');
        assert.ok(existsSync(envPath), '.env file should exist');
        const content = readFileSync(envPath, 'utf8');
        assert.ok(content.includes('CURSOR_AGENT_MODEL=composer-2.5-fast'));
        assert.ok(content.includes('PORT=3847'));
        assert.ok(content.includes('CURSOR_NATIVE_AGENT_ONBOARDED=1'));
        assert.ok(content.includes('WORKSPACE_PATH='));
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('omits empty telegram settings', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const config = getDefaultConfig();
        writeEnvFile(tmpRoot, config);
        const envPath = path.join(tmpRoot, '.env');
        const content = readFileSync(envPath, 'utf8');
        assert.ok(!content.includes('TELEGRAM_BOT_TOKEN=\n'));
        assert.ok(!content.includes('TELEGRAM_ALLOWED_CHAT_IDS=\n'));
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('includes telegram settings when provided', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const config = {
          ...getDefaultConfig(),
          TELEGRAM_BOT_TOKEN: 'test-token',
          TELEGRAM_ALLOWED_CHAT_IDS: '123,456',
        };
        writeEnvFile(tmpRoot, config);
        const envPath = path.join(tmpRoot, '.env');
        const content = readFileSync(envPath, 'utf8');
        assert.ok(content.includes('TELEGRAM_BOT_TOKEN=test-token'));
        assert.ok(content.includes('TELEGRAM_ALLOWED_CHAT_IDS=123,456'));
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('ensureWorkspaceExists', () => {
    it('creates workspace directory if it does not exist', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const workspacePath = path.join(tmpRoot, 'test-workspace');
        assert.ok(!existsSync(workspacePath), 'Workspace should not exist initially');
        ensureWorkspaceExists(workspacePath);
        assert.ok(existsSync(workspacePath), 'Workspace should exist after ensure');
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('does not fail if workspace already exists', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const workspacePath = path.join(tmpRoot, 'test-workspace');
        mkdirSync(workspacePath, { recursive: true });
        assert.ok(existsSync(workspacePath), 'Workspace should exist initially');
        ensureWorkspaceExists(workspacePath);
        assert.ok(existsSync(workspacePath), 'Workspace should still exist');
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('ensureDefaultConfig', () => {
    it('crea_env_con_defaults_si_no_existe', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const envPath = path.join(tmpRoot, '.env');
        assert.ok(!existsSync(envPath), '.env should not exist initially');
        
        const wasWritten = ensureDefaultConfig(tmpRoot);
        
        assert.strictEqual(wasWritten, true, 'should return true when .env was written');
        assert.ok(existsSync(envPath), '.env should exist after ensure');
        
        const content = readFileSync(envPath, 'utf8');
        assert.ok(content.includes('CURSOR_NATIVE_AGENT_ONBOARDED=1'));
        assert.ok(content.includes('CURSOR_AGENT_MODEL=composer-2.5-fast'));
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

  it('no_debería_rotar_token_existente_cuando_env_tiene_marker_y_token', () => {
    const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
    try {
      const envPath = path.join(tmpRoot, '.env');
      const existingToken = 'existing-test-token-123';
      writeFileSync(envPath, `CURSOR_NATIVE_AGENT_ONBOARDED=1\nCUSTOM=value\nDASHBOARD_TOKEN=${existingToken}\n`, 'utf8');
      
      const wasWritten = ensureDefaultConfig(tmpRoot);
      
      assert.strictEqual(wasWritten, false, 'should return false when .env already has marker and token');
      const content = readFileSync(envPath, 'utf8');
      assert.ok(content.includes('CUSTOM=value'), 'should preserve existing content');
      assert.ok(content.includes(`DASHBOARD_TOKEN=${existingToken}`), 'should preserve existing token');
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

    it('sobrescribe_env_sin_marker', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const envPath = path.join(tmpRoot, '.env');
        writeFileSync(envPath, 'SOME_VAR=value\n', 'utf8');
        
        const wasWritten = ensureDefaultConfig(tmpRoot);
        
        assert.strictEqual(wasWritten, true, 'should return true when .env lacks marker');
        const content = readFileSync(envPath, 'utf8');
        assert.ok(content.includes('CURSOR_NATIVE_AGENT_ONBOARDED=1'));
        assert.ok(content.includes('CURSOR_AGENT_MODEL=composer-2.5-fast'));
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('generateDashboardToken', () => {
    it('debería_generar_token_no_vacío', () => {
      const token = generateDashboardToken();
      assert.ok(token.length > 0);
    });

    it('debería_generar_tokens_únicos', () => {
      const token1 = generateDashboardToken();
      const token2 = generateDashboardToken();
      assert.notEqual(token1, token2);
    });

    it('debería_generar_token_base64url_seguro', () => {
      const token = generateDashboardToken();
      assert.match(token, /^[A-Za-z0-9_-]+$/);
    });
  });

  describe('getDefaultConfig', () => {
    it('debería_incluir_DASHBOARD_TOKEN_generado', () => {
      const config = getDefaultConfig();
      assert.ok(config.DASHBOARD_TOKEN);
      assert.ok(config.DASHBOARD_TOKEN.length > 0);
    });
  });

  describe('writeEnvFile', () => {
    it('debería_escribir_DASHBOARD_TOKEN_en_env', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const config = getDefaultConfig();
        writeEnvFile(tmpRoot, config);
        const envPath = path.join(tmpRoot, '.env');
        const content = readFileSync(envPath, 'utf8');
        assert.ok(content.includes(`DASHBOARD_TOKEN=${config.DASHBOARD_TOKEN}`));
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('ensureDefaultConfig con token', () => {
    it('debería_generar_token_cuando_env_falta', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const envPath = path.join(tmpRoot, '.env');
        assert.ok(!existsSync(envPath));
        
        ensureDefaultConfig(tmpRoot);
        
        const content = readFileSync(envPath, 'utf8');
        assert.match(content, /^DASHBOARD_TOKEN=.+$/m);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('debería_agregar_token_si_env_existe_sin_token', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const envPath = path.join(tmpRoot, '.env');
        writeFileSync(envPath, 'CURSOR_NATIVE_AGENT_ONBOARDED=1\nCURSOR_AGENT_MODEL=composer-2.5-fast\n', 'utf8');
        
        const wasWritten = ensureDefaultConfig(tmpRoot);
        
        assert.strictEqual(wasWritten, true);
        const content = readFileSync(envPath, 'utf8');
        assert.match(content, /^DASHBOARD_TOKEN=.+$/m);
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it('no_debería_rotar_token_existente', () => {
      const tmpRoot = mkdtempSync(path.join(tmpdir(), 'onboard-test-'));
      try {
        const envPath = path.join(tmpRoot, '.env');
        const existingToken = 'existing-test-token-123';
        writeFileSync(envPath, `CURSOR_NATIVE_AGENT_ONBOARDED=1\nDASHBOARD_TOKEN=${existingToken}\n`, 'utf8');
        
        const wasWritten = ensureDefaultConfig(tmpRoot);
        
        assert.strictEqual(wasWritten, false);
        const content = readFileSync(envPath, 'utf8');
        assert.ok(content.includes(`DASHBOARD_TOKEN=${existingToken}`));
      } finally {
        rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });
});
