# Shared Auth Library

## Purpose
Shared authentication utilities, JWT helpers, and security functions used across all services.

## Features (Planned)
- JWT token generation and validation
- Password hashing utilities
- Authentication middleware for Express
- Role-based access control helpers
- Security validation functions

## Development Status
🚧 **In Development** - Package structure ready for implementation

## Usage
```typescript
import { generateToken, validateToken, hashPassword } from '@ml-trading/auth';

// Generate JWT token
const token = generateToken({ userId: '123', role: 'trader' });

// Validate token
const payload = validateToken(token);

// Hash password
const hashedPassword = await hashPassword('password123');
```