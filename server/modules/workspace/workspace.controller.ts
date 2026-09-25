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
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { WorkspaceService } from './workspace.service';
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
} from '@shared/api.interface';

@Controller('api/workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  // ── Dashboard ──

  @Get('dashboard')
  async getDashboard(@Req() req: Request): Promise<DashboardStats> {
    const { userId } = req.userContext;
    return this.workspaceService.getDashboard(userId);
  }

  // ── Favorites ──

  @NeedLogin()
  @Get('favorites')
  async listFavorites(@Req() req: Request): Promise<FavoriteItem[]> {
    const { userId } = req.userContext;
    return this.workspaceService.listFavorites(userId);
  }

  @NeedLogin()
  @Post('favorites')
  async addFavorite(
    @Req() req: Request,
    @Body() body: CreateFavoriteRequest,
  ): Promise<void> {
    const { userId } = req.userContext;
    return this.workspaceService.addFavorite(userId, body.paperId);
  }

  @NeedLogin()
  @Delete('favorites/:paperId')
  async removeFavorite(
    @Req() req: Request,
    @Param('paperId') paperId: string,
  ): Promise<void> {
    const { userId } = req.userContext;
    return this.workspaceService.removeFavorite(userId, paperId);
  }

  // ── Checklist ──

  @Get('checklist')
  async listChecklist(@Req() req: Request): Promise<ChecklistItem[]> {
    const { userId } = req.userContext;
    return this.workspaceService.listChecklist(userId);
  }

  @NeedLogin()
  @Post('checklist')
  async createChecklistItem(
    @Req() req: Request,
    @Body() body: CreateChecklistRequest,
  ): Promise<ChecklistItem> {
    const { userId } = req.userContext;
    return this.workspaceService.createChecklistItem(userId, body);
  }

  @NeedLogin()
  @Patch('checklist/:id')
  async updateChecklistItem(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateChecklistRequest,
  ): Promise<ChecklistItem> {
    const { userId } = req.userContext;
    return this.workspaceService.updateChecklistItem(userId, id, body);
  }

  @NeedLogin()
  @Delete('checklist/:id')
  async deleteChecklistItem(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const { userId } = req.userContext;
    return this.workspaceService.deleteChecklistItem(userId, id);
  }

  // ── Notes ──

  @NeedLogin()
  @Get('notes')
  async listNotes(@Req() req: Request): Promise<NoteItem[]> {
    const { userId } = req.userContext;
    return this.workspaceService.listNotes(userId);
  }

  @NeedLogin()
  @Post('notes')
  async createNote(
    @Req() req: Request,
    @Body() body: CreateNoteRequest,
  ): Promise<NoteItem> {
    const { userId } = req.userContext;
    return this.workspaceService.createNote(userId, body);
  }

  @NeedLogin()
  @Patch('notes/:id')
  async updateNote(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateNoteRequest,
  ): Promise<NoteItem> {
    const { userId } = req.userContext;
    return this.workspaceService.updateNote(userId, id, body);
  }

  @NeedLogin()
  @Delete('notes/:id')
  async deleteNote(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<void> {
    const { userId } = req.userContext;
    return this.workspaceService.deleteNote(userId, id);
  }

  // ── Settings ──

  @NeedLogin()
  @Get('settings')
  async getSettings(@Req() req: Request): Promise<UserSettings> {
    const { userId } = req.userContext;
    return this.workspaceService.getSettings(userId);
  }

  @NeedLogin()
  @Put('settings')
  async updateSettings(
    @Req() req: Request,
    @Body() body: UpdateSettingsRequest,
  ): Promise<UserSettings> {
    const { userId } = req.userContext;
    return this.workspaceService.updateSettings(userId, body);
  }
}