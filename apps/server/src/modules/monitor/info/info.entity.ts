export class InfoEntity {
  cpu: {
    /**
     * CPU型号
     * @example Intel(R) Core(TM) i5-8265U CPU @ 1.60GHz
     */
    brand: string;
    /**
     * 核心数
     * @example 4
     */
    cores: number;
    /**
     * CPU制造商
     * @example Intel
     */
    manufacturer: string;
    /**
     * CPU频率
     * @example 1.60GHz
     */
    speed: string;
  };
  memory: {
    /**
     * 空闲内存
     * @example 8GB
     */
    free: string;
    /**
     * 总内存
     * @example 16GB
     */
    total: string;
    /**
     * 使用率
     * @example 50%
     */
    usage: string;
    /**
     * 已使用内存
     * @example 8GB
     */
    used: string;
  };
  osInfo: {
    /**
     * 系统架构
     * @example x64
     */
    arch: string;
    /**
     * 主机名
     * @example sanyou
     */
    hostname: string;
    /**
     * 操作系统
     * @example Linux
     */
    platform: string;
    /**
     * 操作系统版本
     * @example 5.4.0-65-generic
     */
    release: string;
  };
}
