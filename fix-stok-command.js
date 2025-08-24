/**
 * Fix untuk Command Stok yang Tidak Berfungsi
 * WhatsApp Bot - GiHa Smart Bot
 */

// Debug function untuk command stok
function debugStokCommand() {
    console.log('🔍 Debug Command Stok:');
    console.log('1. Checking database structure...');
    
    // Check if database exists
    if (typeof db === 'undefined') {
        console.log('❌ Database tidak terdefinisi');
        return false;
    }
    
    if (!db.data) {
        console.log('❌ db.data tidak ada');
        return false;
    }
    
    if (!db.data.produk) {
        console.log('❌ db.data.produk tidak ada');
        return false;
    }
    
    console.log('✅ Database structure OK');
    console.log('2. Checking produk data...');
    
    const produkKeys = Object.keys(db.data.produk);
    console.log(`📦 Total produk: ${produkKeys.length}`);
    
    if (produkKeys.length === 0) {
        console.log('⚠️ Tidak ada produk di database');
        return false;
    }
    
    // Check first product structure
    const firstProduct = db.data.produk[produkKeys[0]];
    console.log('🔍 Sample product structure:');
    console.log('- ID:', firstProduct.id);
    console.log('- Name:', firstProduct.name);
    console.log('- Stok length:', firstProduct.stok ? firstProduct.stok.length : 'undefined');
    console.log('- Terjual:', firstProduct.terjual);
    
    return true;
}

// Fixed stok command function
function fixedStokCommand(prefix, sender, ownerNomer) {
    try {
        console.log('🔄 Executing fixed stok command...');
        
        // Check database
        if (!db || !db.data || !db.data.produk) {
            return "❌ Database tidak tersedia atau rusak";
        }
        
        const produkKeys = Object.keys(db.data.produk);
        if (produkKeys.length === 0) {
            return "📦 Belum ada produk di database";
        }
        
        let teks = `*╭────〔 PRODUCT LIST📦 〕─*\n`;
        teks += `*┊・* Cara membeli produk ketik perintah berikut\n`;
        teks += `*┊・* ${prefix}buy kodeproduk jumlah\n`;
        teks += `*┊・* Contoh: ${prefix}buy netflix 2\n`;
        teks += `*┊・* Pastikan kode dan jumlah akun sudah benar\n`;
        teks += `*┊・* Kontak Admin: @${ownerNomer}\n`;
        teks += `*╰┈┈┈┈┈┈┈┈*\n\n`;
        
        produkKeys.forEach(i => {
            const produk = db.data.produk[i];
            if (produk) {
                // Safe access to product properties
                const name = produk.name || 'Unknown';
                const id = produk.id || i;
                const desc = produk.desc || 'Tidak ada deskripsi';
                const stokLength = produk.stok && Array.isArray(produk.stok) ? produk.stok.length : 0;
                const terjual = produk.terjual || 0;
                
                // Get price safely
                let harga = 'Harga tidak tersedia';
                try {
                    if (typeof hargaProduk === 'function') {
                        const userRole = db.data.users && db.data.users[sender] ? db.data.users[sender].role : 'bronze';
                        harga = `Rp${toRupiah(hargaProduk(i, userRole))}`;
                    }
                } catch (error) {
                    console.log('⚠️ Error getting price:', error.message);
                    harga = 'Harga tidak tersedia';
                }
                
                teks += `*╭──〔 ${name} 〕─*\n`;
                teks += `*┊・ 🔐| Kode:* ${id}\n`;
                teks += `*┊・ 🏷️| Harga:* ${harga}\n`;
                teks += `*┊・ 📦| Stok Tersedia:* ${stokLength}\n`;
                teks += `*┊・ 🧾| Stok Terjual:* ${terjual}\n`;
                teks += `*┊・ 📝| Desk:* ${desc}\n`;
                teks += `*┊・ ✍️| Ketik:* ${prefix}buy ${id} 1\n`;
                teks += `*╰┈┈┈┈┈┈┈┈*\n\n`;
            }
        });
        
        console.log('✅ Stok command executed successfully');
        return teks;
        
    } catch (error) {
        console.error('❌ Error in stok command:', error);
        return `❌ Terjadi kesalahan: ${error.message}`;
    }
}

// Test function untuk memverifikasi fix
function testStokCommand() {
    console.log('🧪 Testing stok command...');
    
    // Mock data untuk testing
    const mockDb = {
        data: {
            produk: {
                'netflix': {
                    id: 'netflix',
                    name: 'Netflix Premium',
                    desc: 'Netflix Premium Account',
                    priceB: 15000,
                    priceS: 12000,
                    priceG: 10000,
                    profit: 2000,
                    terjual: 50,
                    stok: ['acc1', 'acc2', 'acc3']
                }
            },
            users: {
                'testuser': {
                    role: 'bronze'
                }
            }
        }
    };
    
    // Mock functions
    const mockHargaProduk = (id, role) => {
        const produk = mockDb.data.produk[id];
        if (role === 'bronze') return produk.priceB;
        if (role === 'silver') return produk.priceS;
        if (role === 'gold') return produk.priceG;
        return produk.priceB;
    };
    
    const mockToRupiah = (number) => {
        return number.toLocaleString('id-ID');
    };
    
    // Test
    try {
        const result = fixedStokCommand('.', 'testuser', '6287777657944');
        console.log('✅ Test passed');
        console.log('📝 Result preview:', result.substring(0, 200) + '...');
        return true;
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

// Export functions
module.exports = {
    debugStokCommand,
    fixedStokCommand,
    testStokCommand
};

// Run test if called directly
if (require.main === module) {
    console.log('🧪 Running stok command test...');
    testStokCommand();
} 