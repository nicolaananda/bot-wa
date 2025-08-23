const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { getDashboardData, getDailyChartData, getMonthlyChartData, getUserActivityData } = require('./dashboard-helper');

// Contoh API endpoint untuk dashboard web
// Pastikan install: npm install express cors

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Function untuk membaca database.json
function loadDatabase() {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(dbContent);
  } catch (error) {
    console.error('Error loading database:', error);
    return null;
  }
}

// Function untuk mendapatkan data dengan format yang sesuai
function getFormattedData() {
  const db = loadDatabase();
  if (!db) {
    return null;
  }
  
  // Format data sesuai dengan yang diharapkan dashboard-helper
  return {
    data: {
      transaksi: db.transaksi || [],
      users: db.users || {},
      profit: db.profit || {},
      persentase: db.persentase || {}
    }
  };
}

// API Endpoints

// 1. Dashboard Overview
app.get('/api/dashboard/overview', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const dashboardData = getDashboardData(db);
    if (dashboardData) {
      res.json({
        success: true,
        data: dashboardData
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to process dashboard data'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 2. Chart Data Harian
app.get('/api/dashboard/chart/daily', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const dailyData = getDailyChartData(db);
    res.json({
      success: true,
      data: dailyData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 3. Chart Data Bulanan
app.get('/api/dashboard/chart/monthly', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const monthlyData = getMonthlyChartData(db);
    res.json({
      success: true,
      data: monthlyData
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 4. User Activity
app.get('/api/dashboard/users/activity', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const userActivity = getUserActivityData(db);
    res.json({
      success: true,
      data: userActivity
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 5. Transaksi by User
app.get('/api/dashboard/users/:userId/transactions', (req, res) => {
  try {
    const { userId } = req.params;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Filter transaksi berdasarkan userId
    const userTransactions = db.data.transaksi.filter(t => t.user === userId);
    const totalTransaksi = userTransactions.length;
    const totalSpent = userTransactions.reduce((sum, t) => sum + (t.totalBayar || (parseInt(t.price) * t.jumlah)), 0);
    
    res.json({
      success: true,
      data: {
        user: userId,
        totalTransaksi: totalTransaksi,
        totalSpent: totalSpent,
        transaksi: userTransactions.map(t => ({
          id: t.id,
          name: t.name,
          price: parseInt(t.price),
          date: t.date,
          jumlah: t.jumlah,
          metodeBayar: t.metodeBayar || "Unknown",
          totalBayar: t.totalBayar || (parseInt(t.price) * t.jumlah),
          reffId: t.reffId || "N/A"
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 6. Search Transaksi by Reff ID
app.get('/api/dashboard/transactions/search/:reffId', (req, res) => {
  try {
    const { reffId } = req.params;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Cari transaksi berdasarkan reff ID
    const transaction = db.data.transaksi.find(t => t.reffId === reffId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    // Hitung profit berdasarkan persentase
    const userRole = db.data.users[transaction.user]?.role || "bronze";
    const profitPercentage = db.data.persentase[userRole] || 2;
    const profit = Math.floor((parseInt(transaction.price) * transaction.jumlah) * (profitPercentage / 100));
    
    res.json({
      success: true,
      data: {
        reffId: reffId,
        user: transaction.user || "Unknown",
        userRole: userRole,
        produk: transaction.name,
        idProduk: transaction.id,
        harga: parseInt(transaction.price),
        jumlah: transaction.jumlah,
        totalBayar: transaction.totalBayar || (parseInt(transaction.price) * transaction.jumlah),
        metodeBayar: transaction.metodeBayar || "Unknown",
        tanggal: transaction.date,
        profit: profit
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 7. Export Data
app.get('/api/dashboard/export/:format', (req, res) => {
  try {
    const { format } = req.params;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Export data berdasarkan format
    const filename = `dashboard_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${format}`;
    
    res.json({
      success: true,
      message: `Data berhasil diexport ke format ${format}`,
      filename: filename
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 8. User Statistics
app.get('/api/dashboard/users/stats', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const userStats = {};
    let totalUsers = 0;
    let totalSaldo = 0;
    
    // Process users data
    Object.entries(db.data.users).forEach(([userId, userData]) => {
      if (userId && userId.trim() !== '') {
        totalUsers++;
        totalSaldo += parseInt(userData.saldo) || 0;
        
        if (!userStats[userData.role]) {
          userStats[userData.role] = {
            count: 0,
            totalSaldo: 0
          };
        }
        userStats[userData.role].count++;
        userStats[userData.role].totalSaldo += parseInt(userData.saldo) || 0;
      }
    });
    
    res.json({
      success: true,
      data: {
        totalUsers: totalUsers,
        totalSaldo: totalSaldo,
        userStats: userStats,
        averageSaldo: totalUsers > 0 ? Math.round(totalSaldo / totalUsers) : 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 9. Product Statistics
app.get('/api/dashboard/products/stats', (req, res) => {
  try {
    const db = getFormattedData();
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    const productStats = {};
    let totalProducts = 0;
    let totalSold = 0;
    
    // Process transaksi data to get product statistics
    db.data.transaksi.forEach(t => {
      const productId = t.id;
      const productName = t.name;
      const price = parseInt(t.price) || 0;
      const jumlah = parseInt(t.jumlah) || 1;
      const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
      
      if (!productStats[productId]) {
        productStats[productId] = {
          id: productId,
          name: productName,
          totalSold: 0,
          totalRevenue: 0,
          averagePrice: price,
          transactionCount: 0
        };
      }
      
      productStats[productId].totalSold += jumlah;
      productStats[productId].totalRevenue += totalBayar;
      productStats[productId].transactionCount += 1;
      productStats[productId].averagePrice = Math.round(productStats[productId].totalRevenue / productStats[productId].totalSold);
      
      totalProducts++;
      totalSold += jumlah;
    });
    
    // Convert to array and sort by revenue
    const productStatsArray = Object.values(productStats).sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    res.json({
      success: true,
      data: {
        totalProducts: totalProducts,
        totalSold: totalSold,
        products: productStatsArray,
        topProducts: productStatsArray.slice(0, 10)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 10. Recent Transactions
app.get('/api/dashboard/transactions/recent', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const db = getFormattedData();
    
    if (!db) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load database'
      });
    }
    
    // Sort transactions by date (most recent first) and limit results
    const recentTransactions = db.data.transaksi
      .filter(t => t.date) // Only transactions with dates
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, parseInt(limit))
      .map(t => ({
        id: t.id,
        name: t.name,
        price: parseInt(t.price) || 0,
        date: t.date,
        jumlah: t.jumlah || 1,
        user: t.user || "Unknown",
        metodeBayar: t.metodeBayar || "Unknown",
        totalBayar: t.totalBayar || (parseInt(t.price) * (t.jumlah || 1)),
        reffId: t.reffId || "N/A"
      }));
    
    res.json({
      success: true,
      data: {
        transactions: recentTransactions,
        count: recentTransactions.length,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Dashboard API server running on port ${PORT}`);
    console.log(`API Documentation:`);
    console.log(`- GET /api/dashboard/overview`);
    console.log(`- GET /api/dashboard/chart/daily`);
    console.log(`- GET /api/dashboard/chart/monthly`);
    console.log(`- GET /api/dashboard/users/activity`);
    console.log(`- GET /api/dashboard/users/:userId/transactions`);
    console.log(`- GET /api/dashboard/transactions/search/:reffId`);
    console.log(`- GET /api/dashboard/export/:format`);
    console.log(`- GET /api/dashboard/users/stats`);
    console.log(`- GET /api/dashboard/products/stats`);
    console.log(`- GET /api/dashboard/transactions/recent?limit=20`);
  });
}

module.exports = app; 