import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  // ─── Application ─────────────────────────────────

  @IsBoolean()
  APP_CORS!: boolean;

  @IsBoolean()
  APP_LOG_ON!: boolean;

  @IsString()
  APP_NAME!: string;

  @IsInt()
  @Max(65_535)
  @Min(0)
  APP_PORT!: number;

  @IsString()
  APP_PREFIX!: string;

  // ─── Authentication & Security ───────────────────

  /** 通用助手 / 默认聊天助手所用 LLM ID（格式: `<llm_name>@<provider_id>`） */
  @IsOptional()
  @IsString()
  ASSISTANT_DEFAULT_MODEL?: string;

  /**
   * 助手默认 rerank 模型引用（格式 `<llm_name>@<fid>`）。
   * 不配 = 按 RAGFlow 实例上实际挂载的模型自动选；配空串 = 显式关闭重排序。
   */
  @IsOptional()
  @IsString()
  ASSISTANT_DEFAULT_RERANK?: string;

  @IsInt()
  AUTH_BCRYPT_SALT!: number;

  @IsInt()
  AUTH_JWT_ACCESS_TOKEN_TTL!: number;

  @IsInt()
  AUTH_JWT_REFRESH_TOKEN_TTL!: number;

  // ─── Database (PostgreSQL) ───────────────────────

  @IsString()
  AUTH_JWT_SECRET!: string;

  @IsString()
  DATABASE_DB!: string;

  @IsString()
  DATABASE_HOST!: string;

  @IsString()
  DATABASE_PASSWORD!: string;

  @IsInt()
  @Max(65_535)
  @Min(0)
  DATABASE_PORT!: number;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  DATABASE_USER!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  DB_POOL_CONNECTION_TIMEOUT?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  DB_POOL_IDLE_TIMEOUT?: number;

  // ─── Minio (Object Storage) ──────────────────────

  @IsInt()
  @IsOptional()
  @Min(1)
  DB_POOL_MAX?: number;

  @IsString()
  MINIO_ACCESS_KEY!: string;

  @IsInt()
  @Max(65_535)
  @Min(0)
  MINIO_CLIENT_PORT!: number;

  @IsString()
  MINIO_ENDPOINT!: string;

  @IsInt()
  @Max(65_535)
  @Min(0)
  MINIO_PORT!: number;

  @IsString()
  MINIO_ROOT_PASSWORD!: string;

  @IsString()
  MINIO_ROOT_USER!: string;

  // ─── RAGFlow ─────────────────────────────────────

  @IsString()
  MINIO_SECRET_KEY!: string;

  @IsOptional()
  @IsString()
  RAGFLOW_API_KEY?: string;

  @IsOptional()
  @IsString()
  RAGFLOW_HOST?: string;

  // ─── Redis ───────────────────────────────────────

  @IsString()
  REDIS_HOST!: string;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsInt()
  @Max(65_535)
  @Min(0)
  REDIS_PORT!: number;

  // ─── Weekly Report（对方团队的报告生成服务） ──────

  /** 可不配：未配置时服务照常启动，只有周报接口返回「未配置」 */
  @IsOptional()
  @IsString()
  WEEKLY_REPORT_API_KEY?: string;

  /**
   * 单次生成超时（秒）。nginx 的 /api/ 读超时是 600 秒，要比它短一截，
   * 否则 nginx 先断开，用户拿到的是 nginx 的 504 页面而不是中文提示
   */
  @IsInt()
  @IsOptional()
  @Max(590)
  @Min(1)
  WEEKLY_REPORT_TIMEOUT_SECONDS?: number;

  /** 生成接口的完整地址，如 http://host:8001/generate_report */
  @IsOptional()
  @IsString()
  WEEKLY_REPORT_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
