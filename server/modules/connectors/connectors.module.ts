import { Module } from '@nestjs/common';
import { Controller, Post, Param, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CrossrefConnector } from './crossref.connector';
import { IngestionService, SyncOutcome } from './ingestion.service';

@Controller('api/connectors')
export class ConnectorsController {
  constructor(private readonly ingestion: IngestionService) {}

  // Manual trigger for one source (by ISSN). Protected: only logged-in users may trigger pulls.
  @UseGuards(JwtAuthGuard)
  @Post('sync/:issn')
  @HttpCode(200)
  sync(@Param('issn') issn: string): Promise<SyncOutcome> {
    return this.ingestion.syncSourceByIssn(issn);
  }
}

@Module({
  controllers: [ConnectorsController],
  providers: [CrossrefConnector, IngestionService],
  exports: [IngestionService],
})
export class ConnectorsModule {}
