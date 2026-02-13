import {
  JwtPayload,
  JwtPayloadWithRefreshToken,
} from '../auth/interfaces/jwt-payload.interface';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | JwtPayloadWithRefreshToken;
    }
  }
}

export {};
