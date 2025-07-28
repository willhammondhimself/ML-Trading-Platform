/**
 * @fileoverview JWT utilities for authentication
 */

import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { JWTPayload } from './types';

const JWT_SECRET: string = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '24h';

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256'
  } as SignOptions);
}

export function verifyToken(token: string): JWTPayload {
  try {
    const options: VerifyOptions = {
      algorithms: ['HS256']
    };
    const decoded = jwt.verify(token, JWT_SECRET, options);
    return decoded as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}