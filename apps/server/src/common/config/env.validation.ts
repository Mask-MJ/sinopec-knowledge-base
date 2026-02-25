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

  @IsInt()
  AUTH_BCRYPT_SALT!: number;

  @IsInt()
  AUTH_JWT_ACCESS_TOKEN_TTL!: number;

  @IsInt()
  AUTH_JWT_REFRESH_TOKEN_TTL!: number;

  @IsString()
  AUTH_JWT_SECRET!: string;

  // ─── Database (PostgreSQL) ───────────────────────

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

  // ─── Minio (Object Storage) ──────────────────────

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

  @IsString()
  MINIO_SECRET_KEY!: string;

  // ─── RAGFlow ─────────────────────────────────────

  @IsOptional()
  @IsString()
  RAGFLOW_API_KEY?: string;

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
