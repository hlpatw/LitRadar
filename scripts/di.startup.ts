// Production DI smoke: boots the compiled AppModule from dist/ and asserts that
// CrossrefConnector resolves through the real Nest injector. This reproduces the
// Railway crash ("Nest can't resolve dependencies of CrossrefConnector, Object index[0]")
// which plain unit tests (that never build the DI graph) cannot catch.
import { Test } from '@nestjs/testing';
import appMod from '../dist/server/app.module.js';
import connMod from '../dist/server/modules/connectors/crossref.connector.js';

const { AppModule } = appMod as any;
const { CrossrefConnector } = connMod as any;

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:y@127.0.0.1:1/none';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-at-least-32-characters-long';

const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = mod.createNestApplication();
await app.init();

const c = app.get(CrossrefConnector);
if (!c || typeof c.fetchRecent !== 'function') {
  console.error('FAIL: CrossrefConnector not resolvable');
  process.exit(1);
}
console.log('[ok] AppModule DI compiled; CrossrefConnector resolves');
await app.close();
