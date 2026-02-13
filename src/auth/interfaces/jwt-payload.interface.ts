export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface JwtPayloadWithRefreshToken extends JwtPayload {
  refreshToken: string;
}
