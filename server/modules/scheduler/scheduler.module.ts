import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { ConnectorsModule } from '../connectors/connectors.module';
import { RadarModule } from '../radar/radar.module';

@Module({
  imports: [ConnectorsModule, RadarModule],
  providers: [SchedulerService],
  controllers: [SchedulerController],
  exports: [SchedulerService],
})
export class SchedulerModule {}
