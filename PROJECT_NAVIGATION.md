# ML Trading Platform - Navigation Guide

## Clean Directory Structure ✨

This project now has a **clean, professional structure** with clear separation:

1. **`~/ml-trading-platform/`** - Your main trading platform project  
2. **`~/SuperClaude/`** - SuperClaude framework (separate)

### New Clean Path Structure
```
~/ml-trading-platform/     # Clean and simple!
├── apps/trading-web/      # React 19 + Next.js 15 frontend
├── services/              # 8 microservices (ready for development)
├── shared/                # 4 shared libraries  
├── infrastructure/        # Docker, K8s, monitoring
├── ml-pipeline/           # ML training and inference
└── package.json           # Root workspace config
```

**Benefits:** Easy navigation, professional structure, no nested confusion!

## Quick Navigation

### 🚀 Getting Started
```bash
# Navigate to the clean project directory
cd ~/ml-trading-platform

# Start development server  
pnpm run dev

# Access the trading application
open http://localhost:3000
```

### 📁 Key Directories

#### Applications (`apps/`)
- **`apps/trading-web/`** - Main React 19 + Next.js 15 trading application
  - Frontend with TradingView integration
  - ML analytics dashboard  
  - Real-time WebSocket connections

#### Microservices (`services/`)
All services have package.json templates ready for development:
- **`services/trading-service/`** - Order management and execution
- **`services/market-data-service/`** - Real-time market data streams  
- **`services/user-service/`** - Authentication and user management
- **`services/risk-service/`** - Risk management and compliance
- **`services/ml-analytics-service/`** - ML predictions and analytics ✅ **(Active)**
- **`services/api-gateway/`** - Routing and API management
- **`services/notification-service/`** - Alerts and notifications
- **`services/reporting-service/`** - Analytics and reports
- **`services/alt-data-service/`** - Alternative data feeds

#### Shared Libraries (`shared/`)
- **`shared/domain/`** - Domain models and types ✅ **(Active)**
- **`shared/auth/`** - Authentication utilities
- **`shared/events/`** - Event schemas for Kafka
- **`shared/ui/`** - React component library

#### ML Pipeline (`ml-pipeline/`)
- **`ml-pipeline/models/`** - ML model definitions
- **`ml-pipeline/training/`** - Training pipelines
- **`ml-pipeline/features/`** - Feature engineering
- **`ml-pipeline/inference/`** - Real-time inference

#### Infrastructure (`infrastructure/`)
- **`infrastructure/kubernetes/`** - K8s manifests
- **`infrastructure/docker/`** - Docker configurations
- **`infrastructure/monitoring/`** - Observability setup
- **`infrastructure/terraform/`** - Infrastructure as code

### 🔧 Development Workflow

#### Working on the Trading Platform
```bash
# Main development server (starts all active services)
pnpm run dev

# Individual service development
cd services/[service-name]
pnpm run dev

# Frontend only
cd apps/trading-web  
pnpm run dev
```

#### Package Management
- **Lock file**: Uses `pnpm-lock.yaml` (npm lock files are ignored)
- **Workspaces**: All packages are linked via pnpm workspaces
- **Dependencies**: Shared packages use `workspace:*` references

#### Common Commands
```bash
# Install all dependencies
pnpm install

# Run tests across all packages
pnpm run test

# Build all packages
pnpm run build

# Lint and format
pnpm run lint
pnpm run format

# Clean build artifacts
pnpm run clean
```

### 📊 Service Status

| Service | Status | Port | Description |
|---------|--------|------|-------------|
| trading-web | ✅ Active | 3000 | Frontend application |
| ml-analytics-service | ✅ Active | 8001 | ML predictions |
| market-data-service | ✅ Active | 3001 | Market data streams |
| domain (shared) | ✅ Active | - | Shared types |
| trading-service | 📋 Template | 3002 | Order management |
| user-service | 📋 Template | 3003 | Authentication |
| risk-service | 📋 Template | 3004 | Risk management |
| api-gateway | 📋 Template | 8080 | API routing |

### 🎯 Next Development Steps

1. **Implement Core Services**: Start with trading-service and market-data-service
2. **Set up Infrastructure**: Deploy PostgreSQL, Redis, Kafka using Docker
3. **Develop Shared Libraries**: Complete auth, events, and ui packages  
4. **ML Pipeline**: Build training and inference pipelines
5. **Testing**: Add comprehensive test suites
6. **Documentation**: Complete API documentation

### 🔍 Finding Things

#### Search Patterns
```bash
# Find all package.json files (project packages only)
find . -name "package.json" -not -path "*/node_modules/*"

# Find all TypeScript files in services
find services/ -name "*.ts" -type f

# Find all React components
find apps/ -name "*.tsx" -type f
```

#### Important Files
- **Root package.json**: Main workspace configuration
- **turbo.json**: Build pipeline configuration  
- **.gitignore**: Comprehensive ignore rules
- **pnpm-workspace.yaml**: Workspace definitions

## SuperClaude Framework

The SuperClaude framework is now cleanly separated at `~/SuperClaude/` and ready for use with this project when needed.

### Using SuperClaude with Your Project
```bash
# SuperClaude framework location
~/SuperClaude/
├── SuperClaude/Core/     # Framework core
├── SuperClaude/Commands/ # Command definitions  
├── setup/               # Installation utilities
└── config/              # Configuration files
```

This clean structure provides a professional foundation for your ML Trading Platform while keeping the SuperClaude framework easily accessible!