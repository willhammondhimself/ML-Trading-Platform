# Contributing to ML Trading Platform

Thank you for your interest in contributing to this project! This document provides guidelines and information for contributors.

## 🎯 Project Vision

This trading platform aims to provide institutional-grade trading capabilities with real-time analytics and risk management. We value clean code, comprehensive testing, and professional development practices.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- PostgreSQL 14+ and Redis 7+
- Git with proper configuration

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/ml-trading-platform.git
   cd ml-trading-platform
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Start Services**
   ```bash
   docker-compose up -d
   npm run migrate
   npm run dev
   ```

5. **Verify Setup**
   ```bash
   npm test
   curl http://localhost:3000/health
   ```

## 📋 Development Guidelines

### Code Standards

**Language & Framework**
- TypeScript with strict configuration
- Node.js 18+ with Express.js framework
- React 18+ with TypeScript for frontend
- PostgreSQL for data persistence

**Code Quality Requirements**
- ESLint with Airbnb configuration (zero warnings)
- Prettier formatting (automated via pre-commit hooks)
- 90%+ test coverage for new code
- TypeScript strict mode compliance

**Architecture Principles**
- Clean Architecture with dependency injection
- Microservices pattern for scalability
- Event-driven architecture for real-time features
- API-first design with OpenAPI specification

### Git Workflow

We follow the **GitFlow** workflow with conventional commits:

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Focused Commits**
   ```bash
   git commit -m "feat(component): add user portfolio overview

   - Implement real-time portfolio tracking
   - Add performance metrics calculation
   - Include risk assessment indicators
   
   Closes #123"
   ```

3. **Keep Branch Updated**
   ```bash
   git fetch origin
   git rebase origin/main
   ```

4. **Submit Pull Request**
   - Use the provided PR template
   - Include comprehensive description
   - Add screenshots for UI changes
   - Reference related issues

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`

## 🧪 Testing Requirements

### Test Coverage Standards
- **Unit Tests**: 90%+ coverage for business logic
- **Integration Tests**: All API endpoints covered
- **E2E Tests**: Critical user journeys automated
- **Performance Tests**: Load testing for key endpoints

### Running Tests
```bash
# All tests
npm test

# Unit tests with coverage
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Performance tests
npm run test:performance
```

### Writing Quality Tests
```javascript
// Example: Good test structure
describe('PortfolioService', () => {
  beforeEach(() => {
    // Setup test data
  });

  describe('calculateROI', () => {
    it('should calculate ROI correctly for profitable positions', async () => {
      // Arrange
      const positions = createTestPositions();
      
      // Act
      const roi = await portfolioService.calculateROI(positions);
      
      // Assert
      expect(roi).toBeCloseTo(15.75, 2);
      expect(roi).toBeGreaterThan(0);
    });

    it('should handle edge case of zero initial investment', async () => {
      // Test edge cases and error conditions
    });
  });
});
```

## 🔍 Code Review Process

### Pull Request Requirements

**Before Submitting**
- [ ] All tests pass locally
- [ ] Code follows project style guidelines
- [ ] Documentation updated for API changes
- [ ] Performance impact assessed
- [ ] Security implications considered

**PR Description Template**
```markdown
## Summary
Brief description of changes and motivation

## Changes Made
- Specific change 1
- Specific change 2
- Specific change 3

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass  
- [ ] E2E tests cover new functionality
- [ ] Manual testing completed

## Performance Impact
- Response time: Before/After metrics
- Memory usage: Impact assessment
- Database queries: Optimization notes

## Breaking Changes
List any breaking changes and migration steps

## Screenshots (if applicable)
Visual evidence of UI changes

Closes #123
```

### Review Criteria

**Code Quality**
- Follows established patterns and conventions
- Includes comprehensive error handling
- Has appropriate logging and monitoring
- Maintains security best practices

**Testing**
- Includes relevant test cases
- Maintains or improves test coverage
- Tests are reliable and well-structured
- Performance tests for critical paths

**Documentation**
- API changes documented
- Complex logic explained with comments
- README updated if needed
- Architecture diagrams updated

## 🏗️ Architecture Guidelines

### Project Structure
```
src/
├── components/     # Reusable UI components
├── services/       # Business logic services
├── controllers/    # API route handlers
├── models/         # Data models and schemas
├── utils/          # Helper functions
├── types/          # TypeScript type definitions
└── config/         # Configuration management
```

### API Design Standards
- RESTful design principles
- Consistent error response format
- Proper HTTP status codes
- Comprehensive input validation
- Rate limiting and security headers

### Database Guidelines
- Use migrations for schema changes
- Index performance-critical queries
- Implement proper transaction boundaries
- Follow normalization principles
- Include audit trails for critical data

## 🔒 Security Guidelines

### Security Requirements
- **Authentication**: JWT with proper expiration
- **Authorization**: Role-based access control
- **Input Validation**: Sanitize all user inputs
- **SQL Injection**: Use parameterized queries
- **XSS Protection**: Proper output encoding
- **HTTPS**: All communications encrypted

### Security Checklist
- [ ] Secrets not hardcoded in code
- [ ] Proper error handling without information leakage
- [ ] Input validation on all endpoints
- [ ] Authentication required for protected routes
- [ ] Audit logging for sensitive operations

## 🚀 Performance Guidelines

### Performance Standards
- **API Response Time**: < 200ms for 95th percentile
- **Database Queries**: < 50ms for complex queries
- **Memory Usage**: < 500MB for production instances
- **Frontend Loading**: < 3 seconds on 3G networks

### Optimization Techniques
- Database query optimization and indexing
- Caching strategies with Redis
- API response compression
- Image optimization and lazy loading
- Bundle size optimization

## 📚 Documentation Standards

### Code Documentation
```typescript
/**
 * Calculates portfolio risk metrics using Value at Risk (VaR) methodology
 * 
 * @param positions - Array of portfolio positions
 * @param confidenceLevel - Confidence level for VaR calculation (0.95, 0.99)
 * @param timeHorizon - Time horizon in days for risk assessment
 * @returns Promise resolving to risk metrics object
 * 
 * @example
 * ```typescript
 * const risk = await calculateRiskMetrics(positions, 0.95, 1);
 * console.log(`VaR: ${risk.valueAtRisk}`);
 * ```
 */
export async function calculateRiskMetrics(
  positions: Position[],
  confidenceLevel: number = 0.95,
  timeHorizon: number = 1
): Promise<RiskMetrics> {
  // Implementation details
}
```

### API Documentation
Use OpenAPI 3.0 specification for all endpoints:

```yaml
paths:
  /api/portfolio:
    get:
      summary: Get user portfolio
      description: Retrieves complete portfolio with current positions and performance metrics
      parameters:
        - name: include_history
          in: query
          description: Include historical performance data
          schema:
            type: boolean
            default: false
      responses:
        200:
          description: Portfolio data retrieved successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Portfolio'
```

## ❓ Getting Help

### Communication Channels
- **Issues**: Use GitHub issues for bug reports and feature requests
- **Discussions**: Use GitHub discussions for questions and ideas
- **Email**: reach out to maintainers for security concerns

### Issue Templates
Use provided templates for:
- Bug reports with reproduction steps
- Feature requests with use cases
- Performance issues with metrics
- Security vulnerabilities (private disclosure)

### Mentorship
New contributors welcome! Core maintainers provide:
- Code review feedback and learning opportunities
- Architecture guidance for complex features
- Best practices coaching
- Career development advice

## 🏅 Recognition

### Contributor Levels
- **Contributor**: Merged pull request
- **Regular Contributor**: 5+ merged PRs
- **Core Contributor**: 20+ PRs, reviews others' code
- **Maintainer**: Commit access, release management

### Recognition Program
- Contributors acknowledged in releases
- Annual contributor appreciation
- Conference speaking opportunities
- Reference letters for job applications

## 📄 Legal

### License Agreement
By contributing, you agree that your contributions will be licensed under the MIT License.

### Code of Conduct
All contributors must follow our [Code of Conduct](CODE_OF_CONDUCT.md), ensuring respectful and inclusive collaboration.

---

Thank you for contributing to making institutional-grade trading technology accessible to everyone! 🚀

**Questions?** Open an issue or start a discussion. We're here to help!