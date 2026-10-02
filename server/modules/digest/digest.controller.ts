import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { DigestService } from './digest.service';
import { getAuthenticatedUserId } from '../workspace/workspace-user';
import type { WeeklyDigest } from '@shared/api.interface';

@Controller('api/digest')
export class DigestController {
  constructor(private readonly digest: DigestService) {}

  @UseGuards(JwtAuthGuard)
  @Get('current')
  async current(@Req() req: Request): Promise<WeeklyDigest> {
    const userId = getAuthenticatedUserId(req);
    return this.digest.getCurrentDigest(userId);
  }
}
