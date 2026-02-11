# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-01

### 🎉 Major Refactoring Release

This release represents a complete architectural overhaul of the bot, transforming it from a monolithic codebase to a modern, testable, and maintainable application.

### Added

#### Phase 0: Quick Wins
- **Branding**: Renamed all `ronzz` references to `nicola` (173 occurrences)
- **Environment Template**: Created `.env.example` with all configuration variables
- **Pre-commit Hooks**: Setup Husky for automated code quality checks
- **Contributing Guide**: Added comprehensive `CONTRIBUTING.md`

#### Phase 1: Foundation
- **Testing Infrastructure**
  - Jest test framework with 22 passing tests
  - Test directory structure (unit/integration/e2e)
  - Coverage reporting configuration
  - Test scripts in package.json

- **Logging System**
  - Winston logger with daily log rotation
  - Multiple log levels (error, warn, info, http, debug)
  - 14-day log retention
  - Structured logging with context

- **Environment Validation**
  - Joi schema validation for all environment variables
  - Required/optional field validation
  - Clear error messages on startup

- **CI/CD Pipeline**
  - GitHub Actions workflow
  - Automated linting and testing
  - Security audit (npm audit)
  - Auto-deploy to production on main branch

#### Phase 2: Refactoring
- **Services Layer**
  - `PaymentService`: Payment calculations and saldo processing
  - `ProductService`: Product operations and stock management
  - `UserService`: User management and balance operations

- **Middleware Layer**
  - `RateLimit`: Redis-based rate limiting
  - `TransactionLock`: Prevent concurrent transactions
  - `ErrorHandler`: Centralized error handling
  - `Auth`: Authentication and authorization
  - `Validation`: Input validation with Joi schemas

- **Repository Pattern**
  - `UserRepository`: User data access layer
  - `ProductRepository`: Product data access layer
  - Clean separation of data access logic

#### Phase 3: Optimization
- **Circuit Breaker**
  - Opossum integration for API resilience
  - Automatic fallback on failures
  - Event logging and statistics

- **Health Checks**
  - `/health` endpoint with Redis, PostgreSQL, and GOWA checks
  - `/metrics` endpoint for system metrics

- **Database Migrations**
  - Knex setup for version-controlled migrations
  - Migration infrastructure ready

#### Documentation
- Comprehensive `README.md`
- API documentation structure
- Code examples and usage guides

### Changed
- **Architecture**: Moved from monolithic to layered architecture
- **Error Handling**: Centralized error handling with user-friendly messages
- **Logging**: Replaced console.log with structured Winston logging
- **Code Quality**: Enforced ESLint and Prettier on all commits

### Improved
- **Testability**: 22 unit tests covering core functionality
- **Maintainability**: Services and middleware extracted from main file
- **Reliability**: Circuit breaker and health checks
- **Developer Experience**: Better tooling and documentation

### Technical Details
- **Tests**: 22 passing (6 utils + 16 services)
- **Services**: 3 created (Payment, Product, User)
- **Middleware**: 5 created (RateLimit, Lock, Error, Auth, Validation)
- **Repositories**: 2 created (User, Product)
- **Files Created**: 30+
- **Lines of Code**: ~2,500+

## [1.1.0] - 2026-01-30

### Fixed
- **ECONNRESET Error**: Added retry logic for network errors
- **Group Messages**: Fixed group metadata fetch with retry
- **Rate Limiting**: Improved rate limit handling

### Added
- Retry logic for GOWA API calls
- Exponential backoff for network errors
- Better error logging

## [1.0.0] - 2025-12-01

### Initial Release
- WhatsApp bot with e-commerce features
- Midtrans payment integration
- Product management
- User roles and saldo system

---

## Upgrade Guide

### From 1.x to 2.0

1. **Update Dependencies**
   ```bash
   npm install
   ```

2. **Update Environment Variables**
   ```bash
   cp .env.example .env.new
   # Copy your values from old .env to .env.new
   # Check for new required variables
   ```

3. **Run Tests**
   ```bash
   npm test
   ```

4. **Deploy**
   ```bash
   pm2 restart all
   ```

### Breaking Changes
- None (backward compatible)

### New Features Available
- Services can be used in commands
- Middleware can be applied to commands
- Health checks available at `/health`
- Structured logging in `logs/` directory

---

[2.0.0]: https://github.com/nicolaananda/bot-wa/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/nicolaananda/bot-wa/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nicolaananda/bot-wa/releases/tag/v1.0.0
