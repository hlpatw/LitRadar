import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  app.setGlobalPrefix('api');
  app.enableCors();

  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || '0.0.0.0';
  const port = Number(process.env.SERVER_PORT || '3000');

  app.useStaticAssets(join(__dirname, '..', 'client'), { prefix: '/' });
  app.setBaseViewsDir(join(__dirname, '..', 'client'));
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  app.use((_req: any, res: any, next: any) => {
    if (_req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(join(__dirname, '..', 'client', 'index.html'));
  });

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
}

bootstrap();