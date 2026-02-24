import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.AUTH_JWT_SECRET,
  accessTokenTtl: Number.parseInt(
    process.env.AUTH_JWT_ACCESS_TOKEN_TTL ?? '3600',
    10,
  ),
  refreshTokenTtl: Number.parseInt(
    process.env.AUTH_JWT_REFRESH_TOKEN_TTL ?? '86400',
    10,
  ),
}));
