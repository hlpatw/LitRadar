import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { JournalsModule } from './modules/journals/journals.module';
import { PapersModule } from './modules/papers/papers.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    JournalsModule,
    PapersModule,
    WorkspaceModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}