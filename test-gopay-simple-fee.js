function testGopaySimpleFee() {
  console.log('🧪 Testing Simplified Gopay Fee Calculation...\n');
  
  // Test cases dengan berbagai harga
  const testCases = [
    { unitPrice: 10000, quantity: 1, productName: 'Netflix Basic' },
    { unitPrice: 25000, quantity: 1, productName: 'Zoom Pro' },
    { unitPrice: 50000, quantity: 2, productName: 'Premium Account' },
    { unitPrice: 100000, quantity: 1, productName: 'Enterprise Package' }
  ];
  
  console.log('📊 Simplified Fee Calculation Results:\n');
  
  testCases.forEach((testCase, index) => {
    const { unitPrice, quantity, productName } = testCase;
    
    // Simulasi perhitungan yang sama dengan bot (simplified)
    const amount = unitPrice * quantity;
    
    // Admin fee Gopay 4% (subsidi 50% = customer bayar 2%)
    const gopayAdminFee = Math.ceil(amount * 0.04); // 4% admin fee
    const subsidizedFee = Math.ceil(gopayAdminFee * 0.5); // Customer bayar 50% = 2%
    
    const totalAmount = amount + subsidizedFee;
    
    console.log(`${index + 1}️⃣ ${productName}`);
    console.log(`   💰 Harga: Rp${unitPrice.toLocaleString()}`);
    console.log(`   🔢 Jumlah: ${quantity}`);
    console.log(`   💸 Subtotal: Rp${amount.toLocaleString()}`);
    console.log(`   💳 Admin Fee (4%): Rp${gopayAdminFee.toLocaleString()}`);
    console.log(`   🎁 Subsidi (50%): -Rp${(gopayAdminFee - subsidizedFee).toLocaleString()}`);
    console.log(`   💳 Customer Bayar Fee: Rp${subsidizedFee.toLocaleString()} (2%)`);
    console.log(`   💯 Total Bayar: Rp${totalAmount.toLocaleString()}`);
    console.log(`   📊 Effective Fee: ${((subsidizedFee / amount) * 100).toFixed(1)}%`);
    console.log('');
  });
  
  console.log('🎯 Summary:');
  console.log('✅ No unique code - simpler calculation');
  console.log('✅ Admin fee: 4% (customer pays 2% after 50% subsidy)');
  console.log('✅ Clean display: only show total amount to customer');
  console.log('✅ Background: You subsidize 50% of admin fee');
  
  console.log('\n💡 Payment Message Preview (Simplified):');
  const sampleAmount = 25000;
  const sampleQuantity = 1;
  const sampleGopayFee = Math.ceil(sampleAmount * 0.04);
  const sampleSubsidized = Math.ceil(sampleGopayFee * 0.5);
  const sampleTotal = sampleAmount + sampleSubsidized;
  
  console.log(`*💳 PEMBAYARAN GOPAY 💳*

*📦 Produk:* Sample Product  
*💰 Harga:* Rp${sampleAmount.toLocaleString()}
*🔢 Jumlah:* ${sampleQuantity}
*💯 Total Bayar:* Rp${sampleTotal.toLocaleString()}

*🚨 PENTING:*
• Bayar sesuai nominal: *Rp${sampleTotal.toLocaleString()}*
• Jangan bayar kurang atau lebih
• Pembayaran otomatis terdeteksi`);

  console.log('\n🔍 Behind the Scenes:');
  console.log(`- Base amount: Rp${sampleAmount.toLocaleString()}`);
  console.log(`- Admin fee (4%): Rp${sampleGopayFee.toLocaleString()}`);
  console.log(`- Your subsidy (50%): Rp${(sampleGopayFee - sampleSubsidized).toLocaleString()}`);
  console.log(`- Customer pays: Rp${sampleSubsidized.toLocaleString()} (2% effective)`);
  console.log(`- Total shown to customer: Rp${sampleTotal.toLocaleString()}`);
}

testGopaySimpleFee(); 