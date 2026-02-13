import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshSecret: process.env.REFRESH_TOKEN_SECRET,
  refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
}));
