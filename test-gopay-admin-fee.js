function testGopayAdminFee() {
  console.log('🧪 Testing Gopay Admin Fee Calculation...\n');
  
  // Test cases dengan berbagai harga
  const testCases = [
    { unitPrice: 10000, quantity: 1, productName: 'Netflix Basic' },
    { unitPrice: 25000, quantity: 2, productName: 'Zoom Pro' },
    { unitPrice: 50000, quantity: 1, productName: 'Premium Account' },
    { unitPrice: 100000, quantity: 3, productName: 'Enterprise Package' }
  ];
  
  console.log('📊 Admin Fee Calculation Results:\n');
  
  testCases.forEach((testCase, index) => {
    const { unitPrice, quantity, productName } = testCase;
    
    // Simulasi perhitungan yang sama dengan bot
    const amount = unitPrice * quantity;
    const uniqueCode = Math.floor(1 + Math.random() * 99);
    
    // Admin fee Gopay Midtrans (dengan subsidi 50%)
    const gopayAdminFee = Math.ceil((amount * 0.007) + 2500); // 0.7% + Rp2.500
    const subsidizedFee = Math.ceil(gopayAdminFee * 0.5); // Subsidi 50%
    
    const totalAmount = amount + uniqueCode + subsidizedFee;
    
    console.log(`${index + 1}️⃣ ${productName}`);
    console.log(`   💰 Harga: Rp${unitPrice.toLocaleString()}`);
    console.log(`   🔢 Jumlah: ${quantity}`);
    console.log(`   💸 Subtotal: Rp${amount.toLocaleString()}`);
    console.log(`   🎲 Kode Unik: ${uniqueCode}`);
    console.log(`   💳 Admin Fee (Full): Rp${gopayAdminFee.toLocaleString()}`);
    console.log(`   🎁 Subsidi (50%): -Rp${(gopayAdminFee - subsidizedFee).toLocaleString()}`);
    console.log(`   💳 Admin Fee (After Subsidy): Rp${subsidizedFee.toLocaleString()}`);
    console.log(`   💯 Total Bayar: Rp${totalAmount.toLocaleString()}`);
    console.log(`   📊 Admin Fee Percentage: ${((subsidizedFee / amount) * 100).toFixed(2)}%`);
    console.log('');
  });
  
  console.log('🎯 Summary:');
  console.log('✅ Admin fee calculation: 0.7% + Rp2.500 (Midtrans standard)');
  console.log('✅ Subsidy: 50% dari admin fee');
  console.log('✅ Customer hanya bayar 50% dari admin fee');
  console.log('✅ Breakdown transparan di payment message');
  
  console.log('\n💡 Payment Message Preview:');
  const sampleAmount = 25000;
  const sampleQuantity = 1;
  const sampleUniqueCode = 42;
  const sampleGopayFee = Math.ceil((sampleAmount * 0.007) + 2500);
  const sampleSubsidized = Math.ceil(sampleGopayFee * 0.5);
  const sampleTotal = sampleAmount + sampleUniqueCode + sampleSubsidized;
  
  console.log(`*💳 PEMBAYARAN GOPAY 💳*
  
*📦 Produk:* Sample Product
*💰 Harga:* Rp${sampleAmount.toLocaleString()}
*🔢 Jumlah:* ${sampleQuantity}
*💸 Subtotal:* Rp${sampleAmount.toLocaleString()}
*🎲 Kode Unik:* ${sampleUniqueCode}
*💳 Admin Gopay:* Rp${sampleGopayFee.toLocaleString()} (Subsidi 50%: -Rp${(sampleGopayFee - sampleSubsidized).toLocaleString()})
*💯 Total Bayar:* Rp${sampleTotal.toLocaleString()}

*🚨 PENTING:*
• Bayar sesuai nominal: *Rp${sampleTotal.toLocaleString()}*
• Admin fee Gopay sudah disubsidi 50% oleh kami
• Jangan bayar kurang atau lebih`);
}

testGopayAdminFee(); 