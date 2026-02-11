# 🤖 WhatsApp Bot - Modern E-commerce Bot

[![Tests](https://github.com/nicolaananda/bot-wa/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/nicolaananda/bot-wa/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Modern WhatsApp bot untuk e-commerce dengan fitur lengkap: payment gateway, product management, user roles, dan monitoring.

## ✨ Features

- 🛒 **E-commerce**: Product management, stock tracking, automated ordering
- 💳 **Payment Gateway**: Midtrans integration, saldo system, QRIS payment
- 👥 **User Management**: Role-based pricing (Bronze/Silver/Gold), balance management
- 🔒 **Security**: Rate limiting, transaction locking, circuit breaker
- 📊 **Monitoring**: Health checks, metrics, structured logging
- 🧪 **Testing**: 22 unit tests with Jest
- 🚀 **CI/CD**: GitHub Actions pipeline with auto-deploy

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Redis 6.0+
- PostgreSQL 13+ (optional)
- WhatsApp account

### Installation

```bash
# Clone repository
git clone https://github.com/nicolaananda/bot-wa.git
cd bot-wa

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run tests
npm test

# Start bot
npm start
```

## 📁 Project Structure

```
bot-wa/
├── commands/          # Bot commands (to be extracted)
├── config/            # Configuration files
│   ├── logger.js      # Winston logger
│   ├── env.js         # Environment validation
│   ├── postgres.js    # PostgreSQL config
│   └── redis.js       # Redis config
├── services/          # Business logic layer
│   ├── payment-service.js
│   ├── product-service.js
│   └── user-service.js
├── middleware/        # Express/Bot middleware
│   ├── rate-limit.js
│   ├── transaction-lock.js
│   └── error-handler.js
├── repositories/      # Data access layer
├── lib/               # External integrations
│   ├── gowa-proto.js  # WhatsApp client
│   └── circuit-breaker.js
├── function/          # Helper functions
├── routes/            # API routes
│   └── health.js      # Health check endpoints
├── tests/             # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── index.js           # Main entry point
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e
```

## 📊 Monitoring

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-02-01T12:00:00.000Z",
  "uptime": 3600,
  "checks": {
    "redis": { "status": "ok" },
    "postgres": { "status": "ok" },
    "gowa": { "status": "ok" }
  }
}
```

### Metrics

```bash
curl http://localhost:3000/metrics
```

## 🔧 Configuration

### Environment Variables

See [.env.example](.env.example) for all available configuration options.

**Required**:
- `GOWA_API_URL` - WhatsApp API endpoint
- `GOWA_USERNAME` - WhatsApp API username
- `GOWA_PASSWORD` - WhatsApp API password
- `OWNER_NUMBER` - Bot owner phone number
- `REDIS_URL` - Redis connection URL

**Optional**:
- `USE_PG` - Enable PostgreSQL (default: false)
- `MIDTRANS_SERVER_KEY` - Midtrans payment gateway
- `TELEGRAM_BOT_TOKEN` - Telegram notifications
- `LOG_LEVEL` - Logging level (default: info)

## 📝 Available Commands

### User Commands
- `stok` - View available products
- `buy <product> <qty>` - Purchase with saldo
- `buynow <product> <qty>` - Purchase with payment gateway
- `saldo` - Check balance
- `profile` - View user profile

### Admin Commands
- `addproduk` - Add new product
- `delproduk` - Delete product
- `addsaldo` - Add user balance
- `setrole` - Set user role
- `broadcast` - Send broadcast message

## 🏗️ Architecture

### Services Layer
Business logic separated into services:
- **PaymentService**: Payment calculations, saldo processing
- **ProductService**: Product operations, stock management
- **UserService**: User management, balance operations

### Middleware Layer
Reusable middleware for common operations:
- **RateLimit**: Redis-based rate limiting
- **TransactionLock**: Prevent concurrent transactions
- **ErrorHandler**: Centralized error handling

### Circuit Breaker
API resilience with Opossum:
- Automatic fallback on failures
- Configurable thresholds
- Event logging and stats

## 🚀 Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start npm --name "bot-wa" -- start

# View logs
pm2 logs bot-wa

# Restart
pm2 restart bot-wa
```

### Using Docker

```bash
# Build image
docker build -t bot-wa .

# Run container
docker run -d \
  --name bot-wa \
  --env-file .env \
  -p 3000:3000 \
  bot-wa
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Quality

- Pre-commit hooks run ESLint and Prettier
- All tests must pass
- Maintain test coverage above 30%

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Winston](https://github.com/winstonjs/winston) - Logging
- [Jest](https://jestjs.io/) - Testing framework
- [Opossum](https://github.com/nodeshift/opossum) - Circuit breaker

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/nicolaananda/bot-wa/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nicolaananda/bot-wa/discussions)

## 🔗 Links

- [Documentation](docs/)
- [API Reference](docs/api.md)
- [Changelog](CHANGELOG.md)

---

**Made with ❤️ by Nicola**