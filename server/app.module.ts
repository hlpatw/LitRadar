import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { JournalsModule } from './modules/journals/journals.module';
import { PapersModule } from './modules/papers/papers.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
  imports: [
    PlatformModule.forRoot(),
    JournalsModule,
    PapersModule,
    WorkspaceModule,
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}