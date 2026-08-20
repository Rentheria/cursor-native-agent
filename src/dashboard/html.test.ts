import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { escapeHtml, formatTimestamp } from './html.js';

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    assert.equal(escapeHtml('&'), '&amp;');
    assert.equal(escapeHtml('<'), '&lt;');
    assert.equal(escapeHtml('>'), '&gt;');
    assert.equal(escapeHtml('"'), '&quot;');
    assert.equal(escapeHtml("'"), '&#39;');
  });

  it('should escape multiple characters', () => {
    assert.equal(
      escapeHtml('<script>alert("XSS")</script>'),
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
    );
  });
});

describe('formatTimestamp', () => {
  it('should return "ahora" for current time', () => {
    const now = new Date('2026-08-20T15:30:00.000Z');
    const timestamp = '2026-08-20T15:30:00.000Z';
    assert.equal(formatTimestamp(timestamp, now), 'ahora');
  });

  it('should return "hace X min" for recent timestamps', () => {
    const now = new Date('2026-08-20T15:30:00.000Z');
    const timestamp2min = '2026-08-20T15:28:00.000Z';
    const timestamp45min = '2026-08-20T14:45:00.000Z';
    
    assert.equal(formatTimestamp(timestamp2min, now), 'hace 2 min');
    assert.equal(formatTimestamp(timestamp45min, now), 'hace 45 min');
  });

  it('should return "HH:MM" for timestamps within the last 24 hours', () => {
    const now = new Date('2026-08-20T15:30:00.000Z');
    const timestamp = '2026-08-20T09:31:00.000Z';
    
    assert.equal(formatTimestamp(timestamp, now), '09:31');
  });

  it('should return "ayer HH:MM" for yesterday timestamps', () => {
    const now = new Date('2026-08-20T15:30:00.000Z');
    const timestamp = '2026-08-19T14:30:00.000Z';
    
    assert.equal(formatTimestamp(timestamp, now), 'ayer 14:30');
  });

  it('should return "hace X días" for recent days', () => {
    const now = new Date('2026-08-20T15:30:00.000Z');
    const timestamp3days = '2026-08-17T15:30:00.000Z';
    const timestamp5days = '2026-08-15T15:30:00.000Z';
    
    assert.equal(formatTimestamp(timestamp3days, now), 'hace 3 días');
    assert.equal(formatTimestamp(timestamp5days, now), 'hace 5 días');
  });

  it('should return "DD/MM" for older timestamps', () => {
    const now = new Date('2026-08-20T15:30:00.000Z');
    const timestamp = '2026-07-15T12:00:00.000Z';
    
    assert.equal(formatTimestamp(timestamp, now), '15/07');
  });

  it('should return original string for invalid timestamps', () => {
    const now = new Date('2026-08-20T15:30:00.000Z');
    const invalid = 'not-a-timestamp';
    
    assert.equal(formatTimestamp(invalid, now), 'not-a-timestamp');
  });
});
