import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SourcesService, SourceRow, SourcePaperFilters } from './sources.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { getAuthenticatedUserId } from '../workspace/workspace-user';
import { isValidUuid } from '../../common/utils/doi.util';
import type { SourceDetail, SourcePaperListResponse } from '@shared/api.interface';

@Controller('api/sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  // Public read: shows hierarchy (parentId), research priority, polling policy,
  // connector type/status and last sync. Archived sources are flagged, not hidden.
  @Get()
  list(): Promise<SourceRow[]> {
    return this.sources.list();
  }

  // User-facing source detail: header metadata / status / sync / counts / website.
  @Get(':id')
  detail(@Param('id') id: string): Promise<SourceDetail> {
    if (!isValidUuid(id)) throw new BadRequestException('非法的来源 ID（应为 UUID）');
    return this.sources.getById(id);
  }

  // Strict paper list for one source. Requires a login so the per-user
  // "not-in-library" filter and row-level favorite/reading state can be scoped.
  @UseGuards(JwtAuthGuard)
  @Get(':id/papers')
  papers(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('hasAbstract') hasAbstract?: string,
    @Query('notInLibrary') notInLibrary?: string,
    @Query('order') order?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize?: number,
  ): Promise<SourcePaperListResponse> {
    if (!isValidUuid(id)) throw new BadRequestException('非法的来源 ID（应为 UUID）');
    const userId = getAuthenticatedUserId(req);
    const truthy = (v?: string) => v === '1' || v === 'true';
    const filters: SourcePaperFilters = {
      search,
      from,
      to,
      hasAbstract: hasAbstract === undefined ? undefined : truthy(hasAbstract),
      notInLibrary: truthy(notInLibrary),
      order: order === 'recommend' ? 'recommend' : 'latest',
    };
    return this.sources.listPapers(id, filters, userId, page ?? 1, pageSize ?? 20);
  }
}
