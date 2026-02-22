export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number; // JWT 발급 시간 (Unix timestamp)
  exp?: number; // JWT 만료 시간 (Unix timestamp)
}

export interface JwtPayloadWithRefreshToken extends JwtPayload {
  refreshToken: string;
}
