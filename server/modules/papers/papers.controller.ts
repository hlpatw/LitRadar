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
import { CreatePaperDto, UpdatePaperDto } from './dto/paper.dto';
import type {
  PaperItem,
  PaperDetail,
  PaginatedResponse,
} from '@shared/api.interface';

@Controller('api/papers')
export class PapersController {
  constructor(private readonly papersService: PapersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(
    @Req() req: Request,
    @Query('journalId') journalId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('priority') priority?: string,
    @Query('hasAbstract') hasAbstract?: string,
    @Query('favorite') favorite?: string,
    @Query('todo') todo?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe)
    page?: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe)
    pageSize?: number,
  ): Promise<PaginatedResponse<PaperItem>> {
    const { userId } = req.user as { userId: string };
    const truthy = (v?: string) => v === '1' || v === 'true';
    const hasAbs = hasAbstract === undefined
      ? undefined
      : truthy(hasAbstract);
    return this.papersService.list(
      {
        journalId,
        search,
        from,
        to,
        priority,
        hasAbstract: hasAbs,
        favorite: truthy(favorite) ? true : undefined,
        todo: truthy(todo) ? true : undefined,
      },
      userId,
      page,
      pageSize,
    );
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
    @Body() dto: CreatePaperDto,
  ): Promise<PaperItem> {
    const { userId } = req.user as { userId: string };
    return this.papersService.create(dto, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdatePaperDto,
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