import { Module } from '@nestjs/common';
import { DigestService } from './digest.service';
import { DigestController } from './digest.controller';
import { RadarModule } from '../radar/radar.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [RadarModule, EventsModule],
  providers: [DigestService],
  controllers: [DigestController],
})
export class DigestModule {}
