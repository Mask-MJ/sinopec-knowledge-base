import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Auth } from '@/modules/auth/authentication/decorators/auth.decorator';
import { AuthType } from '@/modules/auth/authentication/enums/auth-type.enum';

import { HealthEntity } from './health.entity';
import { HealthService } from './health.service';

@ApiTags('健康检查')
@Auth(AuthType.None)
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOkResponse({ type: HealthEntity })
  @ApiOperation({ summary: '健康检查' })
  @Get()
  check(): HealthEntity {
    return this.healthService.check();
  }
}
