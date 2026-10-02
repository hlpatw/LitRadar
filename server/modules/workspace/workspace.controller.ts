import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Req,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import type { Request } from 'express';
import { WorkspaceService } from './workspace.service';
import { getAuthenticatedUserId } from './workspace-user';
import type {
  DashboardStats,
  FavoriteItem,
  ChecklistItem,
  NoteItem,
  UserSettings,
  CreateChecklistRequest,
  UpdateChecklistRequest,
  CreateNoteRequest,
  UpdateNoteRequest,
  UpdateSettingsRequest,
  CreateFavoriteRequest,
  Overview,
} from '@shared/api.interface';

@Controller('api/workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  // ── Dashboard ──

  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  async getDashboard(@Req() req: Request): Promise<DashboardStats> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.getDashboard(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  async getOverview(@Req() req: Request): Promise<Overview> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.getOverview(userId);
  }

  // ── Favorites ──

  @UseGuards(JwtAuthGuard)
  @Get('favorites')
  async listFavorites(@Req() req: Request): Promise<FavoriteItem[]> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.listFavorites(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('favorites')
  async addFavorite(
    @Req() req: Request,
    @Body() body: CreateFavoriteRequest,
  ): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.addFavorite(userId, body.paperId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('favorites/:paperId')
  async removeFavorite(
    @Req() req: Request,
    @Param('paperId') paperId: string,
  ): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.removeFavorite(userId, paperId);
  }

  // ── Checklist ──

  @UseGuards(JwtAuthGuard)
  @Get('checklist')
  async listChecklist(@Req() req: Request): Promise<ChecklistItem[]> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.listChecklist(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checklist')
  async createChecklistItem(
    @Req() req: Request,
    @Body() body: CreateChecklistRequest,
  ): Promise<ChecklistItem> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.createChecklistItem(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('checklist/:id')
  async updateChecklistItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateChecklistRequest,
  ): Promise<ChecklistItem> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.updateChecklistItem(userId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('checklist/:id')
  async deleteChecklistItem(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.deleteChecklistItem(userId, id);
  }

  // ── Notes ──

  @UseGuards(JwtAuthGuard)
  @Get('notes')
  async listNotes(@Req() req: Request): Promise<NoteItem[]> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.listNotes(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notes')
  async createNote(
    @Req() req: Request,
    @Body() body: CreateNoteRequest,
  ): Promise<NoteItem> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.createNote(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('notes/:id')
  async updateNote(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateNoteRequest,
  ): Promise<NoteItem> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.updateNote(userId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('notes/:id')
  async deleteNote(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.deleteNote(userId, id);
  }

  // ── Settings ──

  @UseGuards(JwtAuthGuard)
  @Get('settings')
  async getSettings(@Req() req: Request): Promise<UserSettings> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.getSettings(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('settings')
  async updateSettings(
    @Req() req: Request,
    @Body() body: UpdateSettingsRequest,
  ): Promise<UserSettings> {
    const userId = getAuthenticatedUserId(req);
    return this.workspaceService.updateSettings(userId, body);
  }
}