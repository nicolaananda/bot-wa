const fs = require('fs');
const path = require('path');

function setupEnvironment() {
  console.log('🔧 Midtrans Environment Setup Helper\n');
  
  const envPath = path.join(__dirname, '.env');
  const examplePath = path.join(__dirname, 'env.example');
  
  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    console.log('📁 .env file already exists');
    console.log('📍 Location:', envPath);
    
    try {
      const envContent = fs.readFileSync(envPath, 'utf8');
      console.log('\n📋 Current .env content:');
      console.log('==========================================');
      
      // Mask sensitive values
      const maskedContent = envContent
        .split('\n')
        .map(line => {
          if (line.includes('MIDTRANS_SERVER_KEY=') && line.split('=')[1]) {
            return `MIDTRANS_SERVER_KEY=${line.split('=')[1].substring(0, 15)}...`;
          }
          if (line.includes('MIDTRANS_CLIENT_KEY=') && line.split('=')[1]) {
            return `MIDTRANS_CLIENT_KEY=${line.split('=')[1].substring(0, 15)}...`;
          }
          return line;
        })
        .join('\n');
      
      console.log(maskedContent);
      console.log('==========================================\n');
    } catch (error) {
      console.log('❌ Could not read .env file:', error.message);
    }
  } else {
    console.log('❌ .env file not found');
    
    // Try to create from example
    if (fs.existsSync(examplePath)) {
      console.log('📋 Creating .env from env.example...');
      
      try {
        fs.copyFileSync(examplePath, envPath);
        console.log('✅ .env file created successfully');
        console.log('📍 Location:', envPath);
      } catch (error) {
        console.log('❌ Failed to create .env file:', error.message);
        return;
      }
    } else {
      console.log('❌ env.example file not found');
      return;
    }
  }
  
  console.log('🔍 Validating Midtrans configuration...\n');
  
  // Load and validate environment variables
  require('dotenv').config();
  
  const requiredVars = {
    MIDTRANS_SERVER_KEY: {
      description: 'Server Key from Midtrans Dashboard',
      pattern: /^Mid-server-.+$/,
      example: 'Mid-server-abc123xyz'
    },
    MIDTRANS_CLIENT_KEY: {
      description: 'Client Key from Midtrans Dashboard', 
      pattern: /^Mid-client-.+$/,
      example: 'Mid-client-abc123xyz'
    },
    MIDTRANS_MERCHANT_ID: {
      description: 'Merchant ID from Midtrans Dashboard',
      pattern: /^G[0-9]+$/,
      example: 'G123456789'
    }
  };
  
  let allValid = true;
  const issues = [];
  
  for (const [varName, config] of Object.entries(requiredVars)) {
    const value = process.env[varName];
    
    if (!value) {
      allValid = false;
      issues.push({
        type: 'missing',
        varName,
        description: config.description,
        example: config.example
      });
      continue;
    }
    
    if (!config.pattern.test(value)) {
      allValid = false;
      issues.push({
        type: 'invalid',
        varName,
        description: config.description,
        example: config.example,
        current: value.substring(0, 20) + '...'
      });
      continue;
    }
    
    console.log(`✅ ${varName}: Valid`);
  }
  
  if (!allValid) {
    console.log('\n🚨 Issues found:\n');
    
    issues.forEach(issue => {
      if (issue.type === 'missing') {
        console.log(`❌ ${issue.varName}: MISSING`);
        console.log(`   Description: ${issue.description}`);
        console.log(`   Example: ${issue.example}\n`);
      } else {
        console.log(`❌ ${issue.varName}: INVALID FORMAT`);
        console.log(`   Description: ${issue.description}`);
        console.log(`   Current: ${issue.current}`);
        console.log(`   Expected: ${issue.example}\n`);
      }
    });
    
    console.log('💡 How to fix:');
    console.log('1. Login to Midtrans Dashboard');
    console.log('2. Go to Settings > Access Keys');
    console.log('3. Copy your Server Key and Client Key');
    console.log('4. Update your .env file with correct values');
    console.log('5. Make sure keys start with "Mid-server-" and "Mid-client-"');
    console.log('6. Restart your application\n');
    
    console.log('🔗 Midtrans Dashboard: https://dashboard.midtrans.com/');
    console.log('📖 Documentation: https://docs.midtrans.com/\n');
    
    // Offer to bypass validation
    console.log('⚠️  Temporary workaround:');
    console.log('Set SKIP_ENV_VALIDATION=true in your .env file to bypass validation');
    console.log('(Not recommended for production)\n');
    
  } else {
    console.log('\n🎉 All Midtrans environment variables are valid!');
    console.log('✅ Your bot is ready to process Gopay payments\n');
    
    // Show configuration summary
    console.log('📋 Configuration Summary:');
    console.log(`   Environment: ${process.env.MIDTRANS_IS_PRODUCTION === 'true' ? 'PRODUCTION' : 'SANDBOX'}`);
    console.log(`   Merchant ID: ${process.env.MIDTRANS_MERCHANT_ID}`);
    console.log(`   Server Key: ${process.env.MIDTRANS_SERVER_KEY.substring(0, 15)}...`);
    console.log(`   Client Key: ${process.env.MIDTRANS_CLIENT_KEY.substring(0, 15)}...\n`);
    
    console.log('🚀 Ready to test:');
    console.log('   node test-gopay-payment.js');
    console.log('   Or use: .gopay vid3u 1 in WhatsApp\n');
  }
}

// Run if called directly
if (require.main === module) {
  setupEnvironment();
}

module.exports = setupEnvironment; 