import { Buffer } from 'node:buffer';

import { Test, TestingModule } from '@nestjs/testing';

import { BcryptService } from './bcrypt.service';

describe('bcryptService', () => {
  let service: BcryptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BcryptService],
    }).compile();

    service = module.get<BcryptService>(BcryptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hash', () => {
    it('should hash a string password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await service.hash(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123';
      const hash1 = await service.hash(password);
      const hash2 = await service.hash(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should hash a buffer', async () => {
      const buffer = Buffer.from('testPassword123');
      const hashedPassword = await service.hash(buffer);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword.length).toBeGreaterThan(0);
    });
  });

  describe('compare', () => {
    it('should return true for matching password and hash', async () => {
      const password = 'testPassword123';
      const hashedPassword = await service.hash(password);

      const result = await service.compare(password, hashedPassword);

      expect(result).toBe(true);
    });

    it('should return false for non-matching password and hash', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword456';
      const hashedPassword = await service.hash(password);

      const result = await service.compare(wrongPassword, hashedPassword);

      expect(result).toBe(false);
    });

    it('should handle buffer comparison', async () => {
      const password = 'testPassword123';
      const buffer = Buffer.from(password);
      const hashedPassword = await service.hash(password);

      const result = await service.compare(buffer, hashedPassword);

      expect(result).toBe(true);
    });
  });
});
