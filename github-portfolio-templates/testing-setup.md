# Testing and Code Quality Setup Guide

## 🧪 Comprehensive Testing Strategy

### Testing Pyramid Overview

```
         /\
        /  \
       / E2E \ ← Few, high-value integration tests
      /______\
     /        \
    / Integration \ ← Moderate API and service tests  
   /____________\
  /              \
 /   Unit Tests   \ ← Many, fast, isolated tests
/__________________\
```

### Testing Framework Configuration

#### Jest Configuration (`jest.config.js`)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/config/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/services/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  maxWorkers: 4,
};
```

#### Test Setup (`tests/setup.ts`)
```typescript
import { config } from 'dotenv';
import { DatabaseService } from '../src/services/DatabaseService';
import { RedisService } from '../src/services/RedisService';

// Load test environment variables
config({ path: '.env.test' });

// Global test setup
beforeAll(async () => {
  // Initialize test database
  await DatabaseService.initialize();
  await DatabaseService.runMigrations();
  
  // Initialize Redis for testing
  await RedisService.initialize();
  
  // Set test-specific configurations
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
});

// Global test teardown
afterAll(async () => {
  await DatabaseService.close();
  await RedisService.close();
});

// Reset database state between tests
afterEach(async () => {
  await DatabaseService.clearTestData();
  await RedisService.flushTestDB();
});

// Custom Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});
```

## 🔬 Unit Testing Examples

### Service Layer Testing
```typescript
// tests/services/PortfolioService.test.ts
import { PortfolioService } from '../../src/services/PortfolioService';
import { DatabaseService } from '../../src/services/DatabaseService';
import { createMockUser, createMockPositions } from '../fixtures/portfolio';

describe('PortfolioService', () => {
  let portfolioService: PortfolioService;
  let mockUser: any;

  beforeEach(() => {
    portfolioService = new PortfolioService();
    mockUser = createMockUser();
  });

  describe('calculatePortfolioValue', () => {
    it('should calculate total portfolio value correctly', async () => {
      // Arrange
      const positions = createMockPositions([
        { symbol: 'AAPL', quantity: 100, price: 150.00 },
        { symbol: 'GOOGL', quantity: 50, price: 2800.00 },
      ]);

      // Act
      const totalValue = await portfolioService.calculatePortfolioValue(positions);

      // Assert
      expect(totalValue).toBe(155000); // 100*150 + 50*2800
      expect(totalValue).toBeGreaterThan(0);
    });

    it('should handle empty portfolio', async () => {
      // Arrange
      const emptyPositions = [];

      // Act
      const totalValue = await portfolioService.calculatePortfolioValue(emptyPositions);

      // Assert
      expect(totalValue).toBe(0);
    });

    it('should throw error for invalid position data', async () => {
      // Arrange
      const invalidPositions = [{ symbol: '', quantity: -1, price: null }];

      // Act & Assert
      await expect(
        portfolioService.calculatePortfolioValue(invalidPositions)
      ).rejects.toThrow('Invalid position data');
    });
  });

  describe('calculateROI', () => {
    it('should calculate ROI correctly for profitable positions', async () => {
      // Arrange
      const positions = createMockPositions([
        { symbol: 'AAPL', quantity: 100, purchasePrice: 120.00, currentPrice: 150.00 },
      ]);

      // Act
      const roi = await portfolioService.calculateROI(positions);

      // Assert
      expect(roi).toBe(25); // (150-120)/120 * 100 = 25%
      expect(roi).toBeWithinRange(24.99, 25.01);
    });

    it('should calculate negative ROI for losing positions', async () => {
      // Arrange
      const positions = createMockPositions([
        { symbol: 'AAPL', quantity: 100, purchasePrice: 150.00, currentPrice: 120.00 },
      ]);

      // Act
      const roi = await portfolioService.calculateROI(positions);

      // Assert
      expect(roi).toBe(-20); // (120-150)/150 * 100 = -20%
      expect(roi).toBeLessThan(0);
    });
  });
});
```

### API Controller Testing
```typescript
// tests/controllers/PortfolioController.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { AuthService } from '../../src/services/AuthService';
import { createMockUser, createAuthToken } from '../fixtures/auth';

describe('PortfolioController', () => {
  let authToken: string;
  let mockUser: any;

  beforeEach(async () => {
    mockUser = await createMockUser();
    authToken = createAuthToken(mockUser);
  });

  describe('GET /api/portfolio', () => {
    it('should return user portfolio with authentication', async () => {
      // Act
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Assert
      expect(response.body).toHaveProperty('positions');
      expect(response.body).toHaveProperty('totalValue');
      expect(response.body).toHaveProperty('roi');
      expect(response.body.positions).toBeInstanceOf(Array);
      expect(typeof response.body.totalValue).toBe('number');
    });

    it('should return 401 without authentication', async () => {
      // Act & Assert
      await request(app)
        .get('/api/portfolio')
        .expect(401);
    });

    it('should handle portfolio not found', async () => {
      // Arrange
      const newUserToken = createAuthToken({ id: 'nonexistent-user' });

      // Act & Assert
      const response = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${newUserToken}`)
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Portfolio not found');
    });
  });

  describe('POST /api/portfolio/positions', () => {
    it('should create new position successfully', async () => {
      // Arrange
      const newPosition = {
        symbol: 'TSLA',
        quantity: 50,
        price: 800.00,
      };

      // Act
      const response = await request(app)
        .post('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newPosition)
        .expect(201);

      // Assert
      expect(response.body).toHaveProperty('id');
      expect(response.body.symbol).toBe('TSLA');
      expect(response.body.quantity).toBe(50);
      expect(response.body.price).toBe(800.00);
    });

    it('should validate required fields', async () => {
      // Arrange
      const invalidPosition = {
        symbol: '',
        quantity: -1,
      };

      // Act & Assert
      const response = await request(app)
        .post('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidPosition)
        .expect(400);

      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toContain('Symbol is required');
      expect(response.body.errors).toContain('Quantity must be positive');
    });
  });
});
```

## 🔗 Integration Testing

### Database Integration Tests
```typescript
// tests/integration/database.test.ts
import { DatabaseService } from '../../src/services/DatabaseService';
import { UserRepository } from '../../src/repositories/UserRepository';
import { createMockUser } from '../fixtures/user';

describe('Database Integration', () => {
  let userRepository: UserRepository;

  beforeAll(async () => {
    await DatabaseService.initialize();
    userRepository = new UserRepository();
  });

  describe('User Operations', () => {
    it('should create and retrieve user', async () => {
      // Arrange
      const userData = createMockUser();

      // Act
      const createdUser = await userRepository.create(userData);
      const retrievedUser = await userRepository.findById(createdUser.id);

      // Assert
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser.email).toBe(userData.email);
      expect(retrievedUser.id).toBe(createdUser.id);
    });

    it('should handle duplicate email constraint', async () => {
      // Arrange
      const userData = createMockUser();
      await userRepository.create(userData);

      // Act & Assert
      await expect(
        userRepository.create(userData)
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('Transaction Handling', () => {
    it('should rollback transaction on error', async () => {
      // Arrange
      const userData = createMockUser();

      // Act
      try {
        await DatabaseService.transaction(async (trx) => {
          await userRepository.create(userData, trx);
          throw new Error('Simulated error');
        });
      } catch (error) {
        // Expected error
      }

      // Assert
      const user = await userRepository.findByEmail(userData.email);
      expect(user).toBeNull();
    });
  });
});
```

### API Integration Tests
```typescript
// tests/integration/api.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { DatabaseService } from '../../src/services/DatabaseService';
import { createMockUser, createAuthToken } from '../fixtures/auth';

describe('API Integration', () => {
  beforeAll(async () => {
    await DatabaseService.initialize();
  });

  describe('Authentication Flow', () => {
    it('should complete full authentication workflow', async () => {
      // 1. Register user
      const userData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        name: 'Test User',
      };

      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(registerResponse.body).toHaveProperty('user');
      expect(registerResponse.body).toHaveProperty('token');

      // 2. Login with credentials
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        })
        .expect(200);

      expect(loginResponse.body).toHaveProperty('token');
      const authToken = loginResponse.body.token;

      // 3. Access protected resource
      const profileResponse = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(profileResponse.body.email).toBe(userData.email);
      expect(profileResponse.body.name).toBe(userData.name);
    });
  });

  describe('Portfolio Management Workflow', () => {
    let authToken: string;

    beforeEach(async () => {
      const user = await createMockUser();
      authToken = createAuthToken(user);
    });

    it('should handle complete portfolio management flow', async () => {
      // 1. Create initial position
      const positionData = {
        symbol: 'AAPL',
        quantity: 100,
        price: 150.00,
      };

      const createResponse = await request(app)
        .post('/api/portfolio/positions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(positionData)
        .expect(201);

      const positionId = createResponse.body.id;

      // 2. Get portfolio summary
      const portfolioResponse = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(portfolioResponse.body.positions).toHaveLength(1);
      expect(portfolioResponse.body.totalValue).toBe(15000);

      // 3. Update position
      const updateResponse = await request(app)
        .put(`/api/portfolio/positions/${positionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantity: 150 })
        .expect(200);

      expect(updateResponse.body.quantity).toBe(150);

      // 4. Verify updated portfolio value
      const updatedPortfolio = await request(app)
        .get('/api/portfolio')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedPortfolio.body.totalValue).toBe(22500);
    });
  });
});
```

## 🎭 End-to-End Testing with Playwright

### Playwright Configuration (`playwright.config.ts`)
```typescript
import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 2,
  workers: process.env.CI ? 2 : undefined,
  
  use: {
    baseURL: 'http://localhost:3000',
    headless: !!process.env.CI,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
};

export default config;
```

### E2E Test Examples
```typescript
// tests/e2e/portfolio.spec.ts
import { test, expect } from '@playwright/test';
import { createTestUser, loginUser } from '../fixtures/e2e-helpers';

test.describe('Portfolio Management', () => {
  test.beforeEach(async ({ page }) => {
    const user = await createTestUser();
    await loginUser(page, user);
  });

  test('should display portfolio dashboard', async ({ page }) => {
    // Navigate to portfolio
    await page.goto('/portfolio');

    // Check page elements
    await expect(page.locator('h1')).toContainText('Portfolio Overview');
    await expect(page.locator('[data-testid=total-value]')).toBeVisible();
    await expect(page.locator('[data-testid=positions-table]')).toBeVisible();
  });

  test('should add new position', async ({ page }) => {
    await page.goto('/portfolio');

    // Open add position modal
    await page.click('[data-testid=add-position-btn]');
    await expect(page.locator('[data-testid=add-position-modal]')).toBeVisible();

    // Fill form
    await page.fill('[data-testid=symbol-input]', 'AAPL');
    await page.fill('[data-testid=quantity-input]', '100');
    await page.fill('[data-testid=price-input]', '150.00');

    // Submit form
    await page.click('[data-testid=submit-position-btn]');

    // Verify position added
    await expect(page.locator('[data-testid=positions-table]')).toContainText('AAPL');
    await expect(page.locator('[data-testid=total-value]')).toContainText('$15,000.00');
  });

  test('should handle real-time price updates', async ({ page }) => {
    await page.goto('/portfolio');

    // Wait for WebSocket connection
    await page.waitForSelector('[data-testid=connection-status][data-status=connected]');

    // Verify real-time updates
    const initialValue = await page.textContent('[data-testid=total-value]');
    
    // Simulate price update (mock WebSocket message)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('price-update', {
        detail: { symbol: 'AAPL', price: 155.00 }
      }));
    });

    // Verify value updated
    await expect(page.locator('[data-testid=total-value]')).not.toContainText(initialValue);
  });
});
```

## 📊 Performance Testing

### Load Testing with Artillery
```yaml
# artillery.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Load test"
    - duration: 60
      arrivalRate: 100
      name: "Stress test"
  
scenarios:
  - name: "Portfolio API Load Test"
    weight: 70
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "test@example.com"
            password: "password123"
          capture:
            - json: "$.token"
              as: "authToken"
      - get:
          url: "/api/portfolio"
          headers:
            Authorization: "Bearer {{ authToken }}"
      - get:
          url: "/api/portfolio/positions"
          headers:
            Authorization: "Bearer {{ authToken }}"
            
  - name: "Real-time Data Test"
    weight: 30
    flow:
      - get:
          url: "/api/market/prices/AAPL"
      - get:
          url: "/api/market/prices/GOOGL"
```

### Performance Benchmarks
```typescript
// tests/performance/benchmark.test.ts
import { performance } from 'perf_hooks';
import { PortfolioService } from '../../src/services/PortfolioService';
import { createLargeDataset } from '../fixtures/performance';

describe('Performance Benchmarks', () => {
  let portfolioService: PortfolioService;

  beforeAll(() => {
    portfolioService = new PortfolioService();
  });

  test('portfolio calculation should complete within 100ms for 1000 positions', async () => {
    // Arrange
    const positions = createLargeDataset(1000);
    
    // Act
    const startTime = performance.now();
    await portfolioService.calculatePortfolioValue(positions);
    const endTime = performance.now();
    
    // Assert
    const executionTime = endTime - startTime;
    expect(executionTime).toBeLessThan(100);
    console.log(`Portfolio calculation took ${executionTime.toFixed(2)}ms for 1000 positions`);
  });

  test('memory usage should not exceed 100MB for large datasets', async () => {
    // Arrange
    const initialMemory = process.memoryUsage().heapUsed;
    const positions = createLargeDataset(10000);
    
    // Act
    await portfolioService.calculatePortfolioValue(positions);
    
    // Assert
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
    
    expect(memoryIncrease).toBeLessThan(100);
    console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB for 10000 positions`);
  });
});
```

## 🔧 Code Quality Tools

### ESLint Configuration (`.eslintrc.js`)
```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'security', 'jest'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:security/recommended',
    'plugin:jest/recommended',
    'airbnb-base',
    'airbnb-typescript/base',
  ],
  parserOptions: {
    project: './tsconfig.json',
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    'prefer-const': 'error',
    'no-var': 'error',
    'security/detect-object-injection': 'error',
    'security/detect-sql-injection': 'error',
    'max-len': ['error', { code: 100 }],
    'complexity': ['error', 10],
    'max-depth': ['error', 4],
  },
  env: {
    node: true,
    jest: true,
  },
};
```

### Prettier Configuration (`.prettierrc`)
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

### Husky Pre-commit Hooks
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged",
      "pre-push": "npm run test:unit && npm run build",
      "commit-msg": "commitlint -E HUSKY_GIT_PARAMS"
    }
  },
  "lint-staged": {
    "*.{js,ts}": [
      "eslint --fix",
      "prettier --write",
      "git add"
    ],
    "*.{json,md}": [
      "prettier --write",
      "git add"
    ]
  }
}
```

## 📋 Testing Scripts

### Package.json Test Scripts
```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "jest --testPathPattern=tests/unit",
    "test:integration": "jest --testPathPattern=tests/integration",
    "test:e2e": "playwright test",
    "test:coverage": "jest --coverage",
    "test:watch": "jest --watch",
    "test:performance": "artillery run artillery.yml",
    "test:security": "npm audit && eslint . --ext .ts --config .eslintrc.security.js",
    "lint": "eslint . --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\" \"tests/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"tests/**/*.ts\"",
    "type-check": "tsc --noEmit"
  }
}
```

This comprehensive testing setup ensures:
- 90%+ test coverage with meaningful tests
- Automated code quality enforcement
- Performance monitoring and regression detection
- Security vulnerability scanning
- Cross-browser compatibility validation
- Professional development workflow integration