import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { HealthEntity } from './health.entity';

@Injectable()
export class HealthService {
  private readonly version: string;

  constructor() {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    );
    this.version = pkg.version;
  }

  check(): HealthEntity {
    return {
      status: 'ok',
      version: this.version,
      timestamp: new Date().toISOString(),
    };
  }
}
