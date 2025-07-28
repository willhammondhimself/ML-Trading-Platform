/**
 * @fileoverview Authentication type definitions
 */

export interface User {
  id: string;
  email: string;
  role: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticationResult {
  user: User;
  token: string;
}