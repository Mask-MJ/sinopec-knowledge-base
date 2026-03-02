import { Test, TestingModule } from '@nestjs/testing';
import systemInfo from 'systeminformation';
import { vi } from 'vitest';

import { InfoService } from './info.service';

// Mock systeminformation
vi.mock('systeminformation', () => ({
  default: {
    cpu: vi.fn(),
    mem: vi.fn(),
    osInfo: vi.fn(),
  },
}));

describe('infoService', () => {
  let service: InfoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InfoService],
    }).compile();

    service = module.get<InfoService>(InfoService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('systemInfo', () => {
    it('should return formatted system info', async () => {
      vi.mocked(systemInfo.cpu).mockResolvedValue({
        cores: 8,
        brand: 'Intel',
        manufacturer: 'Intel',
        speed: 2.5,
      } as any);
      vi.mocked(systemInfo.mem).mockResolvedValue({
        total: 17_179_869_184, // 16GB
        free: 8_589_934_592, // 8GB
        used: 8_589_934_592, // 8GB
      } as any);
      vi.mocked(systemInfo.osInfo).mockResolvedValue({
        platform: 'darwin',
        release: '20.0.0',
        arch: 'x64',
        hostname: 'mac',
      } as any);

      const result = await service.systemInfo();

      expect(result).toHaveProperty('cpu');
      expect(result.cpu.speed).toBe('2.5GHz');
      expect(result).toHaveProperty('memory');
      expect(result.memory.total).toBe('16.00GB');
      expect(result.memory.usage).toBe('50.00%');
      expect(result).toHaveProperty('osInfo');
    });
  });
});
