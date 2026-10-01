import { Module } from '@nestjs/common';
import { Controller, Post, Param, UseGuards, HttpCode, BadRequestException } from '@nestjs/common';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { CrossrefConnector } from './crossref.connector';
import { IngestionService, SyncOutcome } from './ingestion.service';
import { getMvpSourceByIssn, isCrossrefReady } from '../sources/mvp.sources';

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
}

@Module({
  controllers: [ConnectorsController],
  providers: [CrossrefConnector, IngestionService],
  exports: [IngestionService],
})
export class ConnectorsModule {}
