import { Controller, Get } from '@nestjs/common';
import { SourcesService, SourceRow } from './sources.service';

@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  // Public read: shows hierarchy (parentId), research priority, polling policy,
  // connector type/status and last sync. Archived sources are flagged, not hidden.
  @Get()
  list(): Promise<SourceRow[]> {
    return this.sources.list();
  }
}
