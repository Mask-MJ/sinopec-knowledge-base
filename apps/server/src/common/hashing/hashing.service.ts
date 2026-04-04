import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class HashingService {
  abstract compare(data: Buffer | string, encrypted: string): Promise<boolean>;
  abstract hash(data: Buffer | string): Promise<string>;
}
