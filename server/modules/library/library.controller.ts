import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { getAuthenticatedUserId } from '../workspace/workspace-user';
import { LibraryService, type LibraryFilters } from './library.service';
import type {
  LibraryItem,
  LibraryListResponse,
  UpsertLibraryRequest,
  SetFeedbackRequest,
  RecommendationResponse,
  RecWeights,
  LibraryState,
} from '@shared/api.interface';

@UseGuards(JwtAuthGuard)
@Controller('api/library')
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
    @Query('hasNotes') hasNotes?: string,
  ): Promise<LibraryListResponse> {
    const userId = getAuthenticatedUserId(req);
    const filters: LibraryFilters = {
      status,
      priority,
      tag,
      q,
      hasNotes: hasNotes === '1' || hasNotes === 'true' ? true : undefined,
    };
    return this.libraryService.list(userId, filters);
  }

  @Get('recommendations')
  async recommendations(
    @Req() req: Request,
    @Query('limit') limit?: string,
  ): Promise<RecommendationResponse> {
    const userId = getAuthenticatedUserId(req);
    return this.libraryService.recommend(userId, limit ? parseInt(limit, 10) : 20);
  }

  @Put(':paperId')
  async upsert(
    @Req() req: Request,
    @Param('paperId') paperId: string,
    @Body() body: UpsertLibraryRequest,
  ): Promise<LibraryItem> {
    const userId = getAuthenticatedUserId(req);
    return this.libraryService.upsert(userId, paperId, body);
  }

  @Delete(':paperId')
  @HttpCode(204)
  async remove(
    @Req() req: Request,
    @Param('paperId') paperId: string,
  ): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    return this.libraryService.remove(userId, paperId);
  }

  @Post(':paperId/favorite')
  @HttpCode(200)
  async setFavorite(
    @Req() req: Request,
    @Param('paperId') paperId: string,
    @Body() body: { isFavorite?: boolean },
  ): Promise<LibraryState> {
    const userId = getAuthenticatedUserId(req);
    // Authoritative quick action: returns the post-state snapshot (with explicit rowExists /
    // favoriteTransition) rather than a fake LibraryItem with id:null when the row was removed.
    return this.libraryService.setFavorite(userId, paperId, body.isFavorite ?? true);
  }

  @Post(':paperId/reading-state')
  @HttpCode(200)
  async setReadingState(
    @Req() req: Request,
    @Param('paperId') paperId: string,
    @Body() body: { state: 'todo' | 'reading' | 'read' | null },
  ): Promise<LibraryItem> {
    const userId = getAuthenticatedUserId(req);
    // Explicit state selector: honor the user's choice verbatim (may regress).
    return this.libraryService.upsert(userId, paperId, { readingState: body.state }, { explicitState: true });
  }

  @Post(':paperId/feedback')
  @HttpCode(200)
  async setFeedback(
    @Req() req: Request,
    @Param('paperId') paperId: string,
    @Body() body: SetFeedbackRequest,
  ): Promise<{ ok: true }> {
    const userId = getAuthenticatedUserId(req);
    await this.libraryService.setFeedback(userId, paperId, body.feedbackType ?? 'uninterested', body.note);
    return { ok: true };
  }

  @Delete(':paperId/feedback')
  @HttpCode(204)
  async clearFeedback(
    @Req() req: Request,
    @Param('paperId') paperId: string,
  ): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    return this.libraryService.clearFeedback(userId, paperId, 'uninterested');
  }
}
