import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { MasterModule } from '../master/master.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [MasterModule, CommonModule],
  controllers: [PortalController],
})
export class PortalModule {}
