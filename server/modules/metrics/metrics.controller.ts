import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { MetricsService } from './metrics.service';
import type { InternalMetrics } from '@shared/api.interface';

@Controller('api/admin/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  // Admin/internal only. Ordinary users get 403 (and the client route redirects).
  @UseGuards(AdminOrCliGuard)
  @Get()
  async internal(): Promise<InternalMetrics> {
    return this.metrics.internalMetrics();
  }
}
