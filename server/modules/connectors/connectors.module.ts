import { Module } from '@nestjs/common';
import { Controller, Post, Param, UseGuards, HttpCode, BadRequestException } from '@nestjs/common';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { CrossrefConnector } from './crossref.connector';
import { IngestionService, SyncOutcome } from './ingestion.service';
import { getMvpSourceByIssn } from '../sources/mvp.sources';

@Controller('api/connectors')
export class ConnectorsController {
  constructor(private readonly ingestion: IngestionService) {}

  // Manual trigger for one source (by ISSN).
  // Admin-or-CLI only: a normal logged-in user cannot trigger outbound fetches + bulk writes.
  // Only sources wired for real polling (crossref, ready) may be pulled; skeleton venues 400.
  @UseGuards(AdminOrCliGuard)
  @Post('sync/:issn')
  @HttpCode(200)
  sync(@Param('issn') issn: string): Promise<SyncOutcome> {
    const cfg = getMvpSourceByIssn(issn);
    if (!cfg || cfg.connectorType !== 'crossref') {
      throw new BadRequestException(
        `No polled Crossref source for ISSN ${issn} (venue is skeleton/not wired)`,
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
