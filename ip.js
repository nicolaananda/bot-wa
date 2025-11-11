// test-proxy.js
const https = require('https'); 
https.get('https://ifconfig.me', res => {
  let body = ''; res.on('data', d => (body 
  += d)); res.on('end', () => 
  console.log('IP keluar dari proxy:', 
  body));
});
