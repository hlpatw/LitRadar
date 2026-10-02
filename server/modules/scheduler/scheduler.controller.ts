import { Controller, Get, Put, Body, UseGuards, Post } from '@nestjs/common';
import { AdminOrCliGuard } from '../../common/guards/admin.guard';
import { SchedulerService } from './scheduler.service';
import type { SchedulerStatus, SetSchedulerPausedRequest } from '@shared/api.interface';

@Controller('api/admin/scheduler')
export class SchedulerController {
  constructor(private readonly scheduler: SchedulerService) {}

  @UseGuards(AdminOrCliGuard)
  @Get()
  async status(): Promise<SchedulerStatus> {
    return this.scheduler.status();
  }

  @UseGuards(AdminOrCliGuard)
  @Put()
  async setPaused(@Body() body: SetSchedulerPausedRequest): Promise<SchedulerStatus> {
    return this.scheduler.setPaused(body.paused);
  }

  // Manual one-off tick (admin/cli), gated by the same internal gates.
  @UseGuards(AdminOrCliGuard)
  @Post('run-once')
  async runOnce() {
    return this.scheduler.tickSafe('manual');
  }
}
