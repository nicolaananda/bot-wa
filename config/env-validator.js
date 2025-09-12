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
      MIDTRANS_MERCHANT_ID: {
        description: 'Midtrans Merchant ID',
        pattern: /^G[0-9]+$/,
        sensitive: false
      },
      MIDTRANS_SERVER_KEY: {
        description: 'Midtrans Server Key for API authentication',
        pattern: /^Mid-server-.+$/,
        sensitive: true
      },
      MIDTRANS_CLIENT_KEY: {
        description: 'Midtrans Client Key for frontend integration', 
        pattern: /^Mid-client-.+$/,
        sensitive: true
      },
      MIDTRANS_IS_PRODUCTION: {
        description: 'Production mode flag (true/false)',
        default: 'false',
        pattern: /^(true|false)$/
      }
    };
    
    this.optionalVars = {
      MIDTRANS_BASE_URL: {
        description: 'Midtrans API base URL',
        default: 'https://api.midtrans.com'
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
        
        // Provide specific guidance for Midtrans keys
        if (varName === 'MIDTRANS_SERVER_KEY') {
          result.errors.push(`   Your key should start with "Mid-server-"`);
          result.errors.push(`   Example: Mid-server-abc123xyz`);
        } else if (varName === 'MIDTRANS_CLIENT_KEY') {
          result.errors.push(`   Your key should start with "Mid-client-"`);
          result.errors.push(`   Example: Mid-client-abc123xyz`);
        }
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
      // Check if we should skip validation (for development/testing)
      if (process.env.SKIP_ENV_VALIDATION === 'true') {
        console.log('⚠️  Environment validation skipped (SKIP_ENV_VALIDATION=true)');
        console.log('🚨 WARNING: Running with potentially invalid configuration!\n');
        return result.config;
      }

      console.log('💡 Solutions:');
      console.log('1. Create a .env file in your project root');
      console.log('2. Copy values from env.example');
      console.log('3. Update with your actual Midtrans credentials');
      console.log('4. Restart the application');
      console.log('5. Or set SKIP_ENV_VALIDATION=true to bypass (not recommended)\n');
      
      process.exit(1);
    }

    return result.config;
  }
}

module.exports = new EnvValidator(); 