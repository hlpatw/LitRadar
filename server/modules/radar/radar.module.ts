import { Module } from '@nestjs/common';
import { RadarService } from './radar.service';
import { RadarController } from './radar.controller';

@Module({
  providers: [RadarService],
  controllers: [RadarController],
  exports: [RadarService],
})
export class RadarModule {}
