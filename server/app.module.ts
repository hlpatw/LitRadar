import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { JournalsModule } from './modules/journals/journals.module';
import { PapersModule } from './modules/papers/papers.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { LibraryModule } from './modules/library/library.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { SourcesModule } from './modules/sources/sources.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { HealthModule } from './modules/health/health.module';
import { VersionModule } from './modules/version/version.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    JournalsModule,
    PapersModule,
    WorkspaceModule,
    LibraryModule,
    SourcesModule,
    ConnectorsModule,
    HealthModule,
    VersionModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}