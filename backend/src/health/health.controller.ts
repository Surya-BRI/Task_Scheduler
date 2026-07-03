import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness — process is running (no dependency checks). */
  @Get()
  @Public()
  check() {
    return this.healthService.getLiveness();
  }

  /** Readiness — verifies database connectivity for load balancers / orchestrators. */
  @Get('ready')
  @Public()
  @HttpCode(HttpStatus.OK)
  async ready() {
    const result = await this.healthService.getReadiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
