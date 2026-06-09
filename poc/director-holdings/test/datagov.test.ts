import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDirectorRows } from '../src/sources/datagov';

const csv = readFileSync(new URL('../fixtures/datagov-listed.csv', import.meta.url), 'utf8');

describe('parseDirectorRows', () => {
  it('擷取指定公司的董監列，且 currentShares 為非負數', () => {
    const rows = parseDirectorRows(csv, '2330');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(typeof r.title).toBe('string');
      expect(r.currentShares).toBeGreaterThanOrEqual(0);
    }
  });
});
