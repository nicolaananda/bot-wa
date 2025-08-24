const fs = require('fs');
const path = require('path');

console.log('Testing database access...');

try {
  const dbPath = path.join(__dirname, 'database.json');
  console.log('Path:', dbPath);
  console.log('Exists:', fs.existsSync(dbPath));
  
  if (fs.existsSync(dbPath)) {
    const content = fs.readFileSync(dbPath, 'utf8');
    console.log('File size:', content.length);
    
    const parsed = JSON.parse(content);
    console.log('Parsed successfully');
    console.log('Keys:', Object.keys(parsed));
    
    if (parsed.users) {
      console.log('Users count:', Object.keys(parsed.users).length);
      console.log('Sample user:', Object.keys(parsed.users)[0]);
    }
    
    if (parsed.transaksi) {
      console.log('Transactions count:', parsed.transaksi.length);
      if (parsed.transaksi.length > 0) {
        console.log('Sample transaction:', parsed.transaksi[0]);
      }
    }
  }
} catch (error) {
  console.log('Error:', error.message);
} 