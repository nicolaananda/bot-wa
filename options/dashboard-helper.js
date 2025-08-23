const fs = require('fs');
const path = require('path');

// Fungsi untuk mendapatkan data dashboard
function getDashboardData(db) {
  try {
    let dashboardData = {
      totalTransaksi: db.data.transaksi.length,
      totalPendapatan: db.data.transaksi.reduce((sum, t) => {
        const price = parseInt(t.price) || 0;
        const jumlah = parseInt(t.jumlah) || 1;
        const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
        return sum + totalBayar;
      }, 0),
      transaksiHariIni: db.data.transaksi.filter(t => {
        let today = new Date().toISOString().split('T')[0];
        return t.date && t.date.startsWith(today);
      }).length,
      pendapatanHariIni: db.data.transaksi.filter(t => {
        let today = new Date().toISOString().split('T')[0];
        if (!t.date || !t.date.startsWith(today)) return false;
        const price = parseInt(t.price) || 0;
        const jumlah = parseInt(t.jumlah) || 1;
        const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
        return true;
      }).reduce((sum, t) => {
        const price = parseInt(t.price) || 0;
        const jumlah = parseInt(t.jumlah) || 1;
        const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
        return sum + totalBayar;
      }, 0),
      metodeBayar: {
        saldo: db.data.transaksi.filter(t => t.metodeBayar === "Saldo").length,
        qris: db.data.transaksi.filter(t => t.metodeBayar === "QRIS").length,
        unknown: db.data.transaksi.filter(t => !t.metodeBayar || (t.metodeBayar !== "Saldo" && t.metodeBayar !== "QRIS")).length
      },
      topUsers: [],
      chartData: {
        daily: getDailyChartData(db),
        monthly: getMonthlyChartData(db),
        userActivity: getUserActivityData(db)
      }
    };
    
    // Hitung top users (hanya untuk transaksi yang memiliki user)
    let userStats = {};
    db.data.transaksi.forEach(t => {
      if (t.user) {
        userStats[t.user] = (userStats[t.user] || 0) + 1;
      }
    });
    
    let sortedUsers = Object.entries(userStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);
    
    dashboardData.topUsers = sortedUsers.map(([user, count]) => ({
      user: user,
      transaksi: count,
      totalSpent: db.data.transaksi.filter(t => t.user === user)
        .reduce((sum, t) => {
          const price = parseInt(t.price) || 0;
          const jumlah = parseInt(t.jumlah) || 1;
          const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
          return sum + totalBayar;
        }, 0)
    }));
    
    return dashboardData;
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    return null;
  }
}

// Fungsi untuk data chart harian (7 hari terakhir)
function getDailyChartData(db) {
  try {
    let dailyData = {};
    let today = new Date();
    
    // Generate 7 hari terakhir
    for (let i = 6; i >= 0; i--) {
      let date = new Date(today);
      date.setDate(date.getDate() - i);
      let dateStr = date.toISOString().split('T')[0];
      dailyData[dateStr] = {
        transaksi: 0,
        pendapatan: 0
      };
    }
    
    // Filter transaksi 7 hari terakhir
    let sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    db.data.transaksi.forEach(t => {
      if (!t.date) return; // Skip if no date
      
      let transaksiDate = new Date(t.date);
      if (transaksiDate >= sevenDaysAgo) {
        let dateStr = transaksiDate.toISOString().split('T')[0];
        if (dailyData[dateStr]) {
          dailyData[dateStr].transaksi += 1;
          const price = parseInt(t.price) || 0;
          const jumlah = parseInt(t.jumlah) || 1;
          const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
          dailyData[dateStr].pendapatan += totalBayar;
        }
      }
    });
    
    return Object.entries(dailyData).map(([date, data]) => ({
      date: date,
      transaksi: data.transaksi,
      pendapatan: data.pendapatan
    }));
  } catch (error) {
    console.error('Error getting daily chart data:', error);
    return [];
  }
}

// Fungsi untuk data chart bulanan (12 bulan terakhir)
function getMonthlyChartData(db) {
  try {
    let monthlyData = {};
    let today = new Date();
    
    // Generate 12 bulan terakhir
    for (let i = 11; i >= 0; i--) {
      let date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      let monthStr = date.toISOString().slice(0, 7); // YYYY-MM
      monthlyData[monthStr] = {
        transaksi: 0,
        pendapatan: 0
      };
    }
    
    // Filter transaksi 12 bulan terakhir
    let twelveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    
    db.data.transaksi.forEach(t => {
      if (!t.date) return; // Skip if no date
      
      let transaksiDate = new Date(t.date);
      if (transaksiDate >= twelveMonthsAgo) {
        let monthStr = transaksiDate.toISOString().slice(0, 7);
        if (monthlyData[monthStr]) {
          monthlyData[monthStr].transaksi += 1;
          const price = parseInt(t.price) || 0;
          const jumlah = parseInt(t.jumlah) || 1;
          const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
          monthlyData[monthStr].pendapatan += totalBayar;
        }
      }
    });
    
    return Object.entries(monthlyData).map(([month, data]) => ({
      month: month,
      transaksi: data.transaksi,
      pendapatan: data.pendapatan
    }));
  } catch (error) {
    console.error('Error getting monthly chart data:', error);
    return [];
  }
}

// Fungsi untuk data aktivitas user
function getUserActivityData(db) {
  try {
    let userActivity = {};
    
    db.data.transaksi.forEach(t => {
      if (t.user) {
        if (!userActivity[t.user]) {
          userActivity[t.user] = {
            user: t.user,
            totalTransaksi: 0,
            totalSpent: 0,
            lastActivity: t.date || new Date().toISOString(),
            metodeBayar: {
              saldo: 0,
              qris: 0,
              unknown: 0
            }
          };
        }
        
        userActivity[t.user].totalTransaksi += 1;
        const price = parseInt(t.price) || 0;
        const jumlah = parseInt(t.jumlah) || 1;
        const totalBayar = parseInt(t.totalBayar) || (price * jumlah);
        userActivity[t.user].totalSpent += totalBayar;
        
        if (t.metodeBayar === "Saldo") {
          userActivity[t.user].metodeBayar.saldo += 1;
        } else if (t.metodeBayar === "QRIS") {
          userActivity[t.user].metodeBayar.qris += 1;
        } else {
          userActivity[t.user].metodeBayar.unknown += 1;
        }
        
        // Update last activity
        if (t.date) {
          let transaksiDate = new Date(t.date);
          let lastActivityDate = new Date(userActivity[t.user].lastActivity);
          if (transaksiDate > lastActivityDate) {
            userActivity[t.user].lastActivity = t.date;
          }
        }
      }
    });
    
    return Object.values(userActivity).sort((a, b) => b.totalTransaksi - a.totalTransaksi);
  } catch (error) {
    console.error('Error getting user activity data:', error);
    return [];
  }
}

// Fungsi untuk export data ke berbagai format
function exportDashboardData(db, format = 'json') {
  try {
    let dashboardData = getDashboardData(db);
    let filename = `dashboard_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
    
    switch (format.toLowerCase()) {
      case 'json':
        let jsonData = JSON.stringify(dashboardData, null, 2);
        fs.writeFileSync(`./options/${filename}.json`, jsonData, 'utf8');
        return `${filename}.json`;
        
      case 'csv':
        let csvData = 'Metric,Value\n';
        csvData += `Total Transaksi,${dashboardData.totalTransaksi}\n`;
        csvData += `Total Pendapatan,${dashboardData.totalPendapatan}\n`;
        csvData += `Transaksi Hari Ini,${dashboardData.transaksiHariIni}\n`;
        csvData += `Pendapatan Hari Ini,${dashboardData.pendapatanHariIni}\n`;
        csvData += `Transaksi Saldo,${dashboardData.metodeBayar.saldo}\n`;
        csvData += `Transaksi QRIS,${dashboardData.metodeBayar.qris}\n`;
        
        // Top Users CSV
        csvData += '\nTop Users\n';
        csvData += 'User,Transaksi,Total Spent\n';
        dashboardData.topUsers.forEach(user => {
          csvData += `${user.user},${user.transaksi},${user.totalSpent}\n`;
        });
        
        fs.writeFileSync(`./options/${filename}.csv`, csvData, 'utf8');
        return `${filename}.csv`;
        
      default:
        throw new Error('Format tidak valid. Gunakan: json atau csv');
    }
  } catch (error) {
    console.error('Error exporting dashboard data:', error);
    return null;
  }
}

module.exports = {
  getDashboardData,
  getDailyChartData,
  getMonthlyChartData,
  getUserActivityData,
  exportDashboardData
}; 