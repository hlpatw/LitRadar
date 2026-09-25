import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  HttpCode,
  ParseIntPipe,
  DefaultValuePipe,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { PapersService } from './papers.service';
import type {
  PaperItem,
  PaperDetail,
  CreatePaperRequest,
  UpdatePaperRequest,
  PaginatedResponse,
} from '@shared/api.interface';

@Controller('api/papers')
export class PapersController {
  constructor(private readonly papersService: PapersService) {}

  @Get()
  async list(
    @Query('journalId') journalId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe)
    page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
    pageSize?: number,
  ): Promise<PaginatedResponse<PaperItem>> {
    return this.papersService.list(journalId, search, page, pageSize);
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<PaperDetail> {
    return this.papersService.detail(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(201)
  async create(
    @Req() req: Request,
    @Body() dto: CreatePaperRequest,
  ): Promise<PaperItem> {
    const { userId } = req.user as { userId: string };
    return this.papersService.create(dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePaperRequest,
  ): Promise<PaperItem> {
    const { userId } = req.user as { userId: string };
    return this.papersService.update(id, dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    return this.papersService.delete(id);
  }
}