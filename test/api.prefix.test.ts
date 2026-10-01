import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// axios baseURL is '/api', so api modules must NOT repeat '/api' in their paths.
// This static guard fails CI if any call slips back to '/api/...'.
const apiDir = join(import.meta.dirname, '..', 'client', 'src', 'api');

test('no client api module repeats the /api prefix (baseURL already includes it)', () => {
  const files = readdirSync(apiDir).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const src = readFileSync(join(apiDir, f), 'utf8');
    // flag any api.<verb>('/api/...') or template `.../api/...`
    const bad = src.match(/(api\.(get|post|put|patch|delete)\(\s*[`'"]\/api)|BASE\s*=\s*['"`]\/api/g);
    assert.equal(bad, null, `${f} repeats /api prefix: ${JSON.stringify(bad)}`);
  }
});
