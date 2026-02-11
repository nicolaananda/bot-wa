# Contributing to WhatsApp Bot

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Redis 6.0+
- PostgreSQL 13+
- Git

### Setup Development Environment

1. **Clone the repository**
   ```bash
   git clone https://github.com/nicolaananda/bot-wa.git
   cd bot-wa
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start services**
   ```bash
   # Start Redis
   brew services start redis  # macOS
   sudo systemctl start redis # Linux
   
   # Start PostgreSQL
   brew services start postgresql  # macOS
   sudo systemctl start postgresql # Linux
   ```

5. **Run the bot**
   ```bash
   npm start
   ```

## 📋 Development Workflow

### 1. Create a Branch
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Changes
- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed

### 3. Test Your Changes
```bash
# Run linter
npm run lint

# Run formatter
npm run format

# Run tests (when available)
npm test
```

### 4. Commit Your Changes
```bash
git add .
git commit -m "type: description"
```

**Commit Message Format**:
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

**Examples**:
```bash
git commit -m "feat: add retry logic for ECONNRESET errors"
git commit -m "fix: resolve group whitelist blocking issue"
git commit -m "docs: update README with new features"
```

### 5. Push and Create Pull Request
```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## 🎯 Code Style Guidelines

### JavaScript/Node.js
- Use ES6+ features
- Use `const` and `let`, avoid `var`
- Use async/await instead of callbacks
- Handle errors properly
- Add JSDoc comments for functions

**Example**:
```javascript
/**
 * Process payment for a product
 * @param {string} userId - User ID
 * @param {string} productId - Product ID
 * @param {number} quantity - Quantity to purchase
 * @returns {Promise<PaymentResult>}
 */
async function processPayment(userId, productId, quantity) {
  try {
    // Implementation
  } catch (error) {
    logger.error('Payment failed', { error, userId, productId });
    throw error;
  }
}
```

### File Organization
```
project/
├── commands/        # Bot commands
├── services/        # Business logic
├── middleware/      # Express/Bot middleware
├── config/          # Configuration files
├── lib/             # External integrations
├── function/        # Helper functions
└── tests/           # Test files
```

## 🧪 Testing

### Writing Tests
```javascript
// tests/unit/services/payment.test.js
describe('PaymentService', () => {
  test('should process saldo payment successfully', async () => {
    const result = await paymentService.processSaldoPayment(
      'user123',
      'prod456',
      1
    );
    
    expect(result.success).toBe(true);
    expect(result.orderId).toBeDefined();
  });
});
```

### Running Tests
```bash
npm test                 # Run all tests
npm test -- --watch      # Watch mode
npm test -- --coverage   # With coverage
```

## 🐛 Reporting Bugs

### Before Reporting
1. Check if the bug has already been reported
2. Try to reproduce the bug
3. Collect relevant information

### Bug Report Template
```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment**
- OS: [e.g., Ubuntu 20.04]
- Node.js version: [e.g., 18.0.0]
- Redis version: [e.g., 6.2.0]
```

## 💡 Suggesting Features

### Feature Request Template
```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Any alternative solutions or features you've considered.

**Additional context**
Add any other context or screenshots.
```

## 📝 Documentation

### Updating Documentation
- Update README.md for user-facing changes
- Update code comments for implementation details
- Add examples for new features
- Update API documentation if applicable

## ✅ Pull Request Checklist

Before submitting a PR, make sure:

- [ ] Code follows project style guidelines
- [ ] Lint passes (`npm run lint`)
- [ ] Format is correct (`npm run format`)
- [ ] Tests pass (if applicable)
- [ ] Documentation is updated
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main

## 🔍 Code Review Process

1. **Automated Checks**: CI/CD runs linting and tests
2. **Manual Review**: Maintainer reviews code
3. **Feedback**: Address any requested changes
4. **Approval**: PR is approved and merged

## 🙏 Thank You!

Your contributions make this project better. We appreciate your time and effort!

## 📞 Need Help?

- **Issues**: [GitHub Issues](https://github.com/nicolaananda/bot-wa/issues)
- **Discussions**: [GitHub Discussions](https://github.com/nicolaananda/bot-wa/discussions)
- **Email**: your-email@example.com

---

**Happy Contributing! 🚀**
