# Git Best Practices & Professional Commit Standards

## Conventional Commit Message Format

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification for consistent, professional commit messages.

### Basic Structure
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(auth): add OAuth 2.0 authentication` |
| `fix` | Bug fix | `fix(api): resolve memory leak in user service` |
| `docs` | Documentation changes | `docs(readme): update installation instructions` |
| `style` | Code style changes (formatting, semicolons, etc.) | `style(components): format with prettier` |
| `refactor` | Code refactoring without feature changes | `refactor(utils): simplify validation logic` |
| `perf` | Performance improvements | `perf(database): optimize user query performance` |
| `test` | Adding or updating tests | `test(auth): add unit tests for login service` |
| `build` | Changes to build system or dependencies | `build(deps): upgrade react to v18.2.0` |
| `ci` | Changes to CI configuration | `ci(actions): add automated security scanning` |
| `chore` | Maintenance tasks | `chore(deps): update development dependencies` |
| `revert` | Reverting previous commits | `revert: "feat(auth): add OAuth 2.0 authentication"` |

### Professional Commit Examples

#### Feature Development
```bash
feat(trading): implement real-time portfolio tracking

- Add WebSocket connection for live price updates
- Implement position calculation engine
- Add portfolio performance metrics dashboard
- Include profit/loss visualization charts

Closes #123
```

#### Bug Fix
```bash
fix(api): resolve race condition in order processing

The order execution service was experiencing race conditions
when processing multiple orders simultaneously, causing
inconsistent portfolio states.

- Add mutex locks around critical sections
- Implement proper transaction isolation
- Add comprehensive error handling
- Include retry mechanism for failed operations

Fixes #456
Performance impact: Reduced order processing errors by 95%
```

#### Performance Optimization
```bash
perf(database): optimize user portfolio queries

Improved query performance for portfolio data retrieval
by implementing database indexing and query optimization.

- Add composite indexes on user_id and timestamp
- Implement query result caching with Redis
- Optimize JOIN operations in portfolio calculations
- Add database connection pooling

Before: 2.3s average query time
After: 180ms average query time (92% improvement)

Closes #789
```

#### Refactoring
```bash
refactor(services): restructure authentication service

Split monolithic authentication service into smaller,
focused modules for better maintainability and testing.

- Extract JWT token management into separate module
- Create dedicated password validation service
- Implement OAuth provider abstraction layer
- Add comprehensive unit tests for each module

No breaking changes to public API
Test coverage increased from 78% to 94%
```

## Git Workflow Best Practices

### Branch Naming Conventions

#### Feature Branches
```bash
feature/user-authentication
feature/real-time-trading
feature/portfolio-analytics
feature/api-rate-limiting
```

#### Bug Fix Branches
```bash
bugfix/memory-leak-fix
bugfix/authentication-timeout
bugfix/data-synchronization
hotfix/security-vulnerability
```

#### Release Branches
```bash
release/v1.2.0
release/v2.0.0-beta
```

#### Maintenance Branches
```bash
chore/dependency-updates
chore/code-cleanup
docs/api-documentation
ci/github-actions-setup
```

### Professional Git Commands

#### Starting New Work
```bash
# Create and switch to feature branch
git checkout -b feature/user-authentication

# Keep branch up to date with main
git fetch origin
git rebase origin/main
```

#### Making Professional Commits
```bash
# Stage specific changes
git add src/auth/login.js tests/auth/login.test.js

# Write descriptive commit message
git commit -m "feat(auth): implement secure login functionality

- Add bcrypt password hashing
- Implement JWT token generation
- Add rate limiting for login attempts
- Include comprehensive input validation

Closes #123"
```

#### Preparing for Code Review
```bash
# Interactive rebase to clean up commit history
git rebase -i HEAD~3

# Push feature branch
git push origin feature/user-authentication

# Create pull request via GitHub CLI
gh pr create --title "feat(auth): implement user authentication system" \
             --body "Implements secure user authentication with JWT tokens and rate limiting"
```

## Git Configuration for Professionals

### Essential Git Configuration
```bash
# Set up identity
git config --global user.name "Your Name"
git config --global user.email "your.professional.email@example.com"

# Set default branch name
git config --global init.defaultBranch main

# Set up better diff and merge tools
git config --global diff.tool vscode
git config --global merge.tool vscode

# Set up commit message template
git config --global commit.template ~/.gitmessage

# Set up automatic rebase for pulls
git config --global pull.rebase true

# Set up signing commits (recommended)
git config --global commit.gpgsign true
git config --global user.signingkey YOUR_GPG_KEY_ID
```

### Commit Message Template
Create `~/.gitmessage`:
```
# <type>[optional scope]: <description>
#
# [optional body]
#
# [optional footer(s)]
#
# Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
# 
# Examples:
# feat(api): add user authentication endpoint
# fix(ui): resolve mobile responsive layout issue
# docs(readme): update installation instructions
#
# Remember:
# - Use imperative mood ("add feature" not "added feature")
# - Keep first line under 50 characters
# - Reference issues and pull requests when applicable
# - Explain the "why" not just the "what"
```

## Advanced Git Practices

### Interactive Rebase for Clean History
```bash
# Clean up last 3 commits before pushing
git rebase -i HEAD~3

# Common rebase actions:
# pick = use commit as-is
# reword = use commit, but edit message
# edit = use commit, but stop for amending
# squash = combine with previous commit
# fixup = like squash, but discard commit message
# drop = remove commit
```

### Handling Complex Merges
```bash
# Merge feature branch with proper commit message
git checkout main
git merge --no-ff feature/user-authentication -m "feat: merge user authentication system

- Implements secure JWT-based authentication
- Adds rate limiting and input validation
- Includes comprehensive test coverage
- Updates API documentation

Closes #123"
```

### Git Hooks for Quality Control

#### Pre-commit Hook (`.git/hooks/pre-commit`)
```bash
#!/bin/sh
# Pre-commit hook for code quality

echo "Running pre-commit checks..."

# Run linting
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ Linting failed. Please fix errors before committing."
    exit 1
fi

# Run tests
npm run test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Please fix failing tests before committing."
    exit 1
fi

# Check commit message format
commit_regex='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,50}'
commit_msg=$(cat .git/COMMIT_EDITMSG)

if ! echo "$commit_msg" | grep -qE "$commit_regex"; then
    echo "❌ Invalid commit message format. Please follow conventional commits."
    echo "Example: feat(api): add user authentication"
    exit 1
fi

echo "✅ Pre-commit checks passed"
```

#### Commit Message Hook (`.git/hooks/commit-msg`)
```bash
#!/bin/sh
# Validate commit message format

commit_regex='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?: .{1,50}'

if ! grep -qE "$commit_regex" "$1"; then
    echo "❌ Invalid commit message format!"
    echo ""
    echo "Format: <type>[optional scope]: <description>"
    echo ""
    echo "Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
    echo ""
    echo "Examples:"
    echo "  feat(auth): add user login functionality"
    echo "  fix(api): resolve database connection issue"
    echo "  docs(readme): update installation guide"
    echo ""
    exit 1
fi
```

## Professional Git Workflow Example

### Complete Feature Development Workflow
```bash
# 1. Start from main branch
git checkout main
git pull origin main

# 2. Create feature branch
git checkout -b feature/portfolio-analytics

# 3. Make focused commits during development
git add src/components/PortfolioChart.js
git commit -m "feat(ui): add portfolio performance chart component"

git add src/services/analyticsService.js
git commit -m "feat(api): implement portfolio analytics calculations"

git add tests/services/analyticsService.test.js
git commit -m "test(api): add comprehensive analytics service tests"

# 4. Keep branch updated
git fetch origin
git rebase origin/main

# 5. Clean up commit history if needed
git rebase -i HEAD~3

# 6. Push feature branch
git push origin feature/portfolio-analytics

# 7. Create professional pull request
gh pr create \
  --title "feat(analytics): implement portfolio performance analytics" \
  --body "## Summary
- Add real-time portfolio performance tracking
- Implement ROI and risk metrics calculations
- Add interactive performance charts
- Include comprehensive test coverage

## Performance Impact
- Chart rendering: <100ms load time
- Analytics calculation: <50ms execution time
- Memory usage: <10MB additional footprint

## Testing
- ✅ Unit tests: 95% coverage
- ✅ Integration tests: All critical paths
- ✅ E2E tests: Complete user workflows
- ✅ Performance tests: Sub-100ms response time

Closes #456"

# 8. After approval and merge, clean up
git checkout main
git pull origin main
git branch -d feature/portfolio-analytics
git push origin --delete feature/portfolio-analytics
```

## Measuring Git Practice Quality

### Key Metrics for Professional Repositories
- **Commit Frequency**: Regular, consistent commits (daily activity)
- **Commit Message Quality**: Following conventional commits (95%+ compliance)
- **Branch Strategy**: Clean feature branch workflow
- **Code Review**: All changes via pull requests
- **History Cleanliness**: Linear history with meaningful commits
- **Documentation**: Comprehensive commit descriptions with context