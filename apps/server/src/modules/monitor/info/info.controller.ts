import { Controller, Sse } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { InfoEntity } from './info.entity';
import { InfoService } from './info.service';

@ApiBearerAuth('bearer')
@ApiTags('服务器运行状态')
@Controller('info')
export class InfoController {
  constructor(private readonly infoService: InfoService) {}

  @ApiOkResponse({ type: InfoEntity })
  @ApiOperation({ summary: '运行信息' })
  @Sse()
  systemInfo() {
    return this.infoService.systemInfo();
  }
}
