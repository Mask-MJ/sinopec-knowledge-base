import { Buffer } from 'node:buffer';

import { Injectable } from '@nestjs/common';
import { compare, genSalt, hash } from 'bcrypt';

import { HashingService } from './hashing.service';

@Injectable()
export class BcryptService implements HashingService {
  compare(data: Buffer | string, encrypted: string): Promise<boolean> {
    return compare(data, encrypted);
  }
  async hash(data: Buffer | string): Promise<string> {
    const salt = await genSalt();
    return hash(data, salt);
  }
}
