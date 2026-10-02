import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { isValidUuid } from '../../common/utils/doi.util';
import { IngestionService, SyncOutcome, SyncRunRow } from './ingestion.service';

/**
 * Admin-only Source Management API. Ordinary users (even logged-in) get 403; the
 * CLI/x-admin-token path still works for ops. Single-source sync only — there is
 * deliberately no batch sync endpoint here.
 */
@UseGuards(AdminOrCliGuard)
@Controller('api/admin/sources')
export class AdminSourcesController {
  constructor(private readonly ingestion: IngestionService) {}

  // Sync one source by id. Hard-gated by readiness (skeleton/disabled -> 400) and by
  // running protection (an in-flight run -> 409).
  @Post(':id/sync')
  @HttpCode(200)
  sync(@Param('id') id: string): Promise<SyncOutcome> {
    if (!isValidUuid(id)) throw new BadRequestException('非法的来源 ID（应为 UUID）');
    return this.ingestion.syncSourceById(id);
  }

  // Retry the last (or any) failed run by re-running the source. Same gating as sync.
  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string): Promise<SyncOutcome> {
    if (!isValidUuid(id)) throw new BadRequestException('非法的来源 ID（应为 UUID）');
    return this.ingestion.syncSourceById(id);
  }

  // Full run fields for one source (provenance panel).
  @Get(':id/runs')
  runs(@Param('id') id: string): Promise<SyncRunRow[]> {
    if (!isValidUuid(id)) throw new BadRequestException('非法的来源 ID（应为 UUID）');
    return this.ingestion.listRunsForSource(id, 50);
  }
}
