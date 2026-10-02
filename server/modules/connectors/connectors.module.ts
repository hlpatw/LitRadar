import { Module, Controller, Get, Post, Param, UseGuards, HttpCode, BadRequestException, Query } from '@nestjs/common';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CrossrefConnector } from './crossref.connector';
import { IngestionService, SyncOutcome, SyncRunRow } from './ingestion.service';
import { isCrossrefReady } from '../sources/mvp.sources';

@Controller('api/connectors')
export class ConnectorsController {
  constructor(private readonly ingestion: IngestionService) {}

  // Manual trigger for one source (by ISSN).
  // Admin-or-CLI only. Only the 7 Crossref-runnable MVP ISSNs may be pulled; every
  // other MVP entity (conferences/arXiv/ACL/LDR) is skeleton and returns 400.
  @UseGuards(AdminOrCliGuard)
  @Post('sync/:issn')
  @HttpCode(200)
  sync(@Param('issn') issn: string): Promise<SyncOutcome> {
    if (!isCrossrefReady(issn)) {
      throw new BadRequestException(
        `No pollable Crossref source for ISSN ${issn} (not in the 7-ISSN ready whitelist)`,
      );
    }
    return this.ingestion.syncSourceByIssn(issn);
  }

  // Manual trigger for ALL 7 Crossref-ready sources at once. Admin-or-CLI only.
  // No scheduler exists; this is the only way bulk sync runs.
  @UseGuards(AdminOrCliGuard)
  @Post('sync-all')
  @HttpCode(200)
  syncAll(): Promise<SyncOutcome[]> {
    return this.ingestion.syncAllReady();
  }

  // Read-only sync-run status. Any authenticated user may view run history.
  @UseGuards(JwtAuthGuard)
  @Get('runs')
  runs(@Query('limit') limit?: string): Promise<SyncRunRow[]> {
    return this.ingestion.listRuns(limit ? Number(limit) : 50);
  }
}

@Module({
  controllers: [ConnectorsController],
  providers: [CrossrefConnector, IngestionService],
  exports: [IngestionService],
})
export class ConnectorsModule {}
