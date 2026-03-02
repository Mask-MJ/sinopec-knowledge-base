import { Injectable } from '@nestjs/common';
import systemInfo from 'systeminformation';

@Injectable()
export class InfoService {
  async systemInfo() {
    const { cores, brand, manufacturer, speed } = await systemInfo.cpu();
    const { total, free, used } = await systemInfo.mem();
    const { platform, release, arch, hostname } = await systemInfo.osInfo();

    return {
      cpu: { cores, brand, manufacturer, speed: speed + 'GHz' },
      memory: {
        total: (total / 1024 / 1024 / 1024).toFixed(2) + 'GB',
        free: (free / 1024 / 1024 / 1024).toFixed(2) + 'GB',
        used: (used / 1024 / 1024 / 1024).toFixed(2) + 'GB',
        usage: `${((used / total) * 100).toFixed(2)}%`,
      },
      osInfo: { platform, release, arch, hostname },
    };
  }
}
