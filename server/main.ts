import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';
import { Client } from 'pg';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { runUp } from './database/migrator';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';

  // Fail fast in production if no database is configured. Without this, main.ts would
  // skip migrations below AND DatabaseModule builds a lazy pool, so the app would boot
  // and serve /api/version (which swallows DB errors) while zero tables existed and
  // every data endpoint failed — a silent half-deploy. Local dev without a DB still
  // boots (NODE_ENV != production).
  if (isProd && !process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required in production: refusing to boot without a database. ' +
        'Attach a Postgres and set the DATABASE_URL service variable.',
    );
  }

  // B3: apply pending migrations before serving traffic. Tracks state in _migrations so a
  // fresh DB builds fully and an existing DB only applies deltas. Single source of truth
  // (no separate deploy/migration.sql fork at runtime).
  if (process.env.DATABASE_URL) {
    const migClient = new Client({ connectionString: process.env.DATABASE_URL });
    await migClient.connect();
    try {
      const applied = await runUp(migClient);
      if (applied.length) new Logger('Migrations').log(`applied: ${applied.join(', ')}`);
    } finally {
      await migClient.end();
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  // Routing: controllers already declare their own 'api/...' paths. Do NOT add a
  // global 'api' prefix, or every route becomes /api/api/... (the double-/api bug).
  // HealthController is 'health' and is served at the root /health.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Restrict CORS to an explicit origin in production (never wildcard there).
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors(
    corsOrigin
      ? { origin: corsOrigin.split(',').map((s) => s.trim()), credentials: true }
      : true,
  );

  // Refuse to boot in production with a missing/weak JWT secret.
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.JWT_SECRET || '';
    if (secret.length < 32 || /change-me|default|secret/i.test(secret)) {
      throw new Error('JWT_SECRET must be set to a long, non-default random value in production');
    }
  }

  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || '0.0.0.0';
  const port = Number(process.env.SERVER_PORT || '3000');

  app.useStaticAssets(join(__dirname, '..', 'client'), { prefix: '/' });
  app.setBaseViewsDir(join(__dirname, '..', 'client'));
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  app.use((_req: any, res: any, next: any) => {
    if (_req.path.startsWith('/api') || _req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(join(__dirname, '..', 'client', 'index.html'));
  });

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
}

bootstrap();