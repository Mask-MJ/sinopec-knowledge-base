import { ApiProperty } from '@nestjs/swagger';

export class HealthEntity {
  @ApiProperty({ description: '服务状态', example: 'ok' })
  status: string;

  @ApiProperty({ description: '后端版本号', example: '0.1.0' })
  version: string;

  @ApiProperty({
    description: '时间戳',
    example: '2026-04-04T10:00:00.000Z',
  })
  timestamp: string;
}
