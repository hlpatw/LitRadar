import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { EventsService } from './events.service';
import { getAuthenticatedUserId } from '../workspace/workspace-user';
import type { EventAdminSummary, TrackEventRequest } from '@shared/api.interface';

@Controller('api/events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async track(@Req() req: Request, @Body() body: TrackEventRequest) {
    const userId = getAuthenticatedUserId(req);
    return this.events.track(userId, body);
  }

  // Internal/admin metrics only.
  @UseGuards(AdminOrCliGuard)
  @Get('admin/summary')
  async summary(): Promise<EventAdminSummary> {
    return this.events.adminSummary();
  }
}
