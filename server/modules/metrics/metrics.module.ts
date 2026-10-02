import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { RadarModule } from '../radar/radar.module';

@Module({
  imports: [RadarModule],
  providers: [MetricsService],
  controllers: [MetricsController],
})
export class MetricsModule {}
