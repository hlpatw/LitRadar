import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { RadarService } from './radar.service';
import type { RadarHistoryResponse, WeeklyRadarSnapshot } from '@shared/api.interface';

@Controller('api/radar')
export class RadarController {
  constructor(private readonly radar: RadarService) {}

  /** Dashboard-first: current week snapshot (lazy-generated, deterministic) + previous. */
  @UseGuards(JwtAuthGuard)
  @Get('current')
  async current(): Promise<RadarHistoryResponse> {
    return this.radar.getCurrentAndPrevious();
  }

  /** Admin/internal-scheduler only: (re)build the snapshot for the current week. Regular users must NOT trigger scoring writes. */
  @UseGuards(AdminOrCliGuard)
  @Post('generate')
  async generate(): Promise<WeeklyRadarSnapshot> {
    return this.radar.generateSnapshot();
  }
}
