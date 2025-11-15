/**
 * Environment Variables Validator
 * Ensures all required environment variables are properly configured
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
try {
  require('dotenv').config();
} catch (error) {
  // dotenv not installed, environment variables should be set by system
  console.log('dotenv not available, using system environment variables');
}

class EnvValidator {
  constructor() {
    this.requiredVars = {
      // Midtrans configuration
      MIDTRANS_SERVER_KEY: {
        description: 'Midtrans Server Key for API authentication',
        pattern: /^Mid-server-[a-zA-Z0-9_-]+$/,
        sensitive: true
      },
      MIDTRANS_CLIENT_KEY: {
        description: 'Midtrans Client Key for frontend integration',
        pattern: /^Mid-client-[a-zA-Z0-9_-]+$/,
        sensitive: true
      },
      MIDTRANS_MERCHANT_ID: {
        description: 'Midtrans Merchant ID',
        pattern: /^G[0-9]+$/,
        sensitive: false
      }
    };
    
    this.optionalVars = {
      MIDTRANS_IS_PRODUCTION: {
        description: 'Production mode flag (true/false)',
        default: 'false',
        pattern: /^(true|false)$/
      },
      MIDTRANS_BASE_URL: {
        description: 'Midtrans API base URL',
        default: 'https://api.midtrans.com'
      },
      MIDTRANS_STATIC_QRIS: {
        description: 'Static QRIS Code (Livin Merchant)',
        default: '',
        sensitive: false
      },
      // Bot Configuration
      BOT_NAME: {
        description: 'Bot name',
        default: 'GiHa Smart Bot',
        sensitive: false
      },
      BOT_PAIRING_CODE: {
        description: 'Enable pairing code mode (true/false)',
        default: 'true',
        pattern: /^(true|false)$/
      },
      OWNER_NUMBERS: {
        description: 'Owner phone numbers (comma-separated)',
        default: '',
        sensitive: false
      },
      OWNER_NUMBER: {
        description: 'Primary owner phone number',
        default: '',
        sensitive: false
      },
      // Order Kuota (optional but recommended)
      ORDER_KUOTA_MEMBER_ID: {
        description: 'Order Kuota Member ID',
        default: '',
        sensitive: false
      },
      ORDER_KUOTA_PIN: {
        description: 'Order Kuota PIN',
        default: '',
        sensitive: true
      },
      ORDER_KUOTA_PASSWORD: {
        description: 'Order Kuota Password',
        default: '',
        sensitive: true
      },
      // Payment Configuration
      PAYMENT_QRIS_NAME: {
        description: 'QRIS payment name',
        default: 'GIGIHADIOD',
        sensitive: false
      },
      // Listener Configuration
      LISTENER_BASE_URL: {
        description: 'Listener backend base URL',
        default: 'https://api-pg.nicola.id',
        sensitive: false
      },
      LISTENER_API_KEY: {
        description: 'Listener API key',
        default: '',
        sensitive: true
      }
    };
  }

  /**
   * Validate all environment variables
   * @returns {Object} Validation result
   */
  validate() {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      config: {}
    };

    // Check required variables
    for (const [varName, config] of Object.entries(this.requiredVars)) {
      const value = process.env[varName];
      
      if (!value) {
        result.valid = false;
        result.errors.push(`❌ Missing required environment variable: ${varName}`);
        result.errors.push(`   Description: ${config.description}`);
        continue;
      }

      if (config.pattern && !config.pattern.test(value)) {
        result.valid = false;
        result.errors.push(`❌ Invalid format for ${varName}`);
        result.errors.push(`   Expected pattern: ${config.pattern}`);
        continue;
      }

      result.config[varName] = config.sensitive ? '[HIDDEN]' : value;
    }

    // Check optional variables and set defaults
    for (const [varName, config] of Object.entries(this.optionalVars)) {
      const value = process.env[varName] || config.default;
      
      if (config.pattern && value && !config.pattern.test(value)) {
        result.warnings.push(`⚠️  Invalid format for optional variable ${varName}: ${value}`);
        continue;
      }

      result.config[varName] = value;
    }

    return result;
  }

  /**
   * Create .env file from template if it doesn't exist
   */
  createEnvFromTemplate() {
    const envPath = path.join(process.cwd(), '.env');
    const templatePath = path.join(process.cwd(), 'env.example');

    if (!fs.existsSync(envPath) && fs.existsSync(templatePath)) {
      try {
        fs.copyFileSync(templatePath, envPath);
        console.log('✅ Created .env file from template');
        console.log('📝 Please update the values in .env file');
        return true;
      } catch (error) {
        console.error('❌ Failed to create .env file:', error.message);
        return false;
      }
    }

    return false;
  }

  /**
   * Print validation report
   * @param {Object} result Validation result
   */
  printReport(result) {
    console.log('\n🔐 Environment Variables Validation Report');
    console.log('==========================================');

    if (result.valid) {
      console.log('✅ All required environment variables are properly configured\n');
      
      console.log('📋 Configuration Summary:');
      for (const [key, value] of Object.entries(result.config)) {
        console.log(`   ${key}: ${value}`);
      }
    } else {
      console.log('❌ Environment validation failed!\n');
      
      console.log('🚨 Errors:');
      result.errors.forEach(error => console.log(`   ${error}`));
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    console.log('\n==========================================\n');
  }

  /**
   * Validate and exit if invalid
   */
  validateOrExit() {
    // Try to create .env from template
    this.createEnvFromTemplate();

    const result = this.validate();
    this.printReport(result);

    if (!result.valid) {
      console.log('💡 Solutions:');
      console.log('1. Create a .env file in your project root');
      console.log('2. Copy values from env.example');
      console.log('3. Update with your actual credentials:');
      console.log('   - Midtrans credentials (MIDTRANS_SERVER_KEY, MIDTRANS_CLIENT_KEY, MIDTRANS_MERCHANT_ID)');
      console.log('   - Bot configuration (OWNER_NUMBERS, OWNER_NUMBER, BOT_NAME)');
      console.log('   - Order Kuota credentials (ORDER_KUOTA_MEMBER_ID, ORDER_KUOTA_PIN, ORDER_KUOTA_PASSWORD)');
      console.log('   - Payment configuration (PAYMENT_QRIS_NAME, etc.)');
      console.log('4. Restart the application\n');
      
      process.exit(1);
    }

    return result.config;
  }
}

module.exports = new EnvValidator(); 