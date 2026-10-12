import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Public()
  @Get('healthz')
  health() {
    return {
      status: 'ok',
      mongo: this.connection.readyState === 1 ? 'connected' : 'disconnected',
      time: new Date().toISOString(),
    };
  }
}
