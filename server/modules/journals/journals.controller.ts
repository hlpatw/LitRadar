import { Controller, Get, Query } from '@nestjs/common';
import { JournalsService } from './journals.service';

@Controller('api/journals')
export class JournalsController {
  constructor(private readonly journalsService: JournalsService) {}

  @Get()
  async list(@Query('priority') priority?: string, @Query('type') type?: string) {
    return this.journalsService.list(priority, type);
  }
}