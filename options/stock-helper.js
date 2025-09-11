const fs = require('fs');
const path = require('path');

// Stock Management Helper Functions

/**
 * Load database from file
 */
function loadDatabase() {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    if (!fs.existsSync(dbPath)) {
      console.error('Database file not found at:', dbPath);
      return null;
    }
    
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(dbContent);
  } catch (error) {
    console.error('Error loading database:', error);
    return null;
  }
}

/**
 * Save database to file
 */
function saveDatabase(db) {
  try {
    const dbPath = path.join(__dirname, 'database.json');
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving database:', error);
    return false;
  }
}

/**
 * Determine stock status based on count
 */
function getStockStatus(stockCount, minStock = 5) {
  if (stockCount === 0) return 'out';
  if (stockCount <= minStock) return 'low';
  if (stockCount <= minStock * 2) return 'medium';
  return 'good';
}

/**
 * Determine product category based on name and ID
 */
function getProductCategory(productId, productName) {
  const name = productName.toLowerCase();
  const id = productId.toLowerCase();
  
  // Streaming services
  if (
    name.includes('netflix') ||
    name.includes('viu') ||
    name.includes('vidio') ||
    name.includes('youtube') ||
    name.includes('spotify') ||
    name.includes('deezer') ||
    name.includes('wetv') ||
    name.includes('prime')
  ) {
    return 'Streaming';
  }
  
  // Software tools
  if (
    name.includes('capcut') ||
    name.includes('canva') ||
    name.includes('adobe') ||
    name.includes('office') ||
    name.includes('microsoft') ||
    name.includes('chatgpt') ||
    name.includes('ZOOM') ||
    name.includes('SEWA')
  ) {
    return 'Software';
  }
  
  // Gaming
  if (name.includes('game') || name.includes('gaming') || name.includes('steam') || 
      name.includes('psn') || name.includes('xbox')) {
    return 'Gaming';
  }
  
  // Social media
  if (name.includes('instagram') || name.includes('facebook') || name.includes('tiktok') || 
      name.includes('twitter')) {
    return 'Social Media';
  }
  
  // VPN services
  if (name.includes('vpn') || name.includes('nord') || name.includes('express')) {
    return 'VPN';
  }
  
  return 'Software';
}

/**
 * Parse stock item string to object
 */
function parseStockItem(stockString) {
  if (typeof stockString !== 'string') {
    return null;
  }
  
  const parts = stockString.split('|');
  
  // Handle different formats
  if (parts.length >= 4) {
    // Full format: email|password|profile|pin|notes
    return {
      email: parts[0] || '',
      password: parts[1] || '',
      profile: parts[2] || '',
      pin: parts[3] || '',
      notes: parts[4] || '-'
    };
  } else if (parts.length === 2) {
    // Simple format: email|password
    return {
      email: parts[0] || '',
      password: parts[1] || '',
      profile: '',
      pin: '',
      notes: '-'
    };
  } else if (parts.length === 1) {
    // Single format: email
    return {
      email: parts[0] || '',
      password: '',
      profile: '',
      pin: '',
      notes: '-'
    };
  }
  
  return null;
}

/**
 * Validate stock item format
 */
function validateStockItem(stockItem) {
  if (!stockItem || typeof stockItem !== 'string') {
    return false;
  }
  
  const parts = stockItem.split('|');
  return parts.length >= 1 && parts[0].includes('@');
}

/**
 * Calculate stock metrics for a product
 */
function calculateStockMetrics(product) {
  const stockCount = product.stok ? product.stok.length : 0;
  const category = getProductCategory(product.id, product.name);
  const stockStatus = getStockStatus(stockCount);
  
  return {
    stockCount,
    category,
    stockStatus,
    isLowStock: stockCount <= 5,
    isOutOfStock: stockCount === 0,
    needsRestock: stockCount <= 3
  };
}

/**
 * Get stock analytics for dashboard
 */
function getStockAnalytics() {
  const db = loadDatabase();
  if (!db || !db.produk) {
    return null;
  }
  
  const analytics = {
    totalProducts: 0,
    totalStockItems: 0,
    categories: {},
    stockStatus: {
      good: 0,
      medium: 0,
      low: 0,
      out: 0
    },
    lowStockProducts: [],
    outOfStockProducts: [],
    topSellingProducts: []
  };
  
  for (const [productId, product] of Object.entries(db.produk)) {
    const metrics = calculateStockMetrics(product);
    analytics.totalProducts++;
    analytics.totalStockItems += metrics.stockCount;
    
    // Count by category
    if (!analytics.categories[metrics.category]) {
      analytics.categories[metrics.category] = {
        count: 0,
        totalStock: 0,
        totalSales: 0
      };
    }
    analytics.categories[metrics.category].count++;
    analytics.categories[metrics.category].totalStock += metrics.stockCount;
    analytics.categories[metrics.category].totalSales += product.terjual || 0;
    
    // Count by stock status
    analytics.stockStatus[metrics.stockStatus]++;
    
    // Track low stock products
    if (metrics.isLowStock) {
      analytics.lowStockProducts.push({
        id: product.id,
        name: product.name,
        category: metrics.category,
        currentStock: metrics.stockCount,
        status: metrics.stockStatus
      });
    }
    
    // Track out of stock products
    if (metrics.isOutOfStock) {
      analytics.outOfStockProducts.push({
        id: product.id,
        name: product.name,
        category: metrics.category,
        lastSold: product.terjual || 0
      });
    }
  }
  
  // Get top selling products
  analytics.topSellingProducts = Object.values(db.produk)
    .filter(p => p.terjual > 0)
    .sort((a, b) => (b.terjual || 0) - (a.terjual || 0))
    .slice(0, 10)
    .map(p => ({
      id: p.id,
      name: p.name,
      category: getProductCategory(p.id, p.name),
      sales: p.terjual || 0,
      currentStock: p.stok ? p.stok.length : 0
    }));
  
  return analytics;
}

/**
 * Generate stock report
 */
function generateStockReport() {
  const analytics = getStockAnalytics();
  if (!analytics) {
    return null;
  }
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalProducts: analytics.totalProducts,
      totalStockItems: analytics.totalStockItems,
      lowStockCount: analytics.lowStockProducts.length,
      outOfStockCount: analytics.outOfStockProducts.length
    },
    categories: analytics.categories,
    stockStatus: analytics.stockStatus,
    alerts: {
      critical: analytics.outOfStockProducts,
      warning: analytics.lowStockProducts.slice(0, 10) // Top 10 low stock
    },
    recommendations: []
  };
  
  // Generate recommendations
  if (analytics.outOfStockProducts.length > 0) {
    report.recommendations.push({
      type: 'critical',
      message: `${analytics.outOfStockProducts.length} products are out of stock and need immediate restocking`,
      products: analytics.outOfStockProducts.map(p => p.name)
    });
  }
  
  if (analytics.lowStockProducts.length > 0) {
    report.recommendations.push({
      type: 'warning',
      message: `${analytics.lowStockProducts.length} products have low stock and should be monitored`,
      products: analytics.lowStockProducts.slice(0, 5).map(p => p.name)
    });
  }
  
  // Category recommendations
  for (const [category, data] of Object.entries(analytics.categories)) {
    if (data.totalStock < 10) {
      report.recommendations.push({
        type: 'info',
        message: `Category '${category}' has low total stock (${data.totalStock} items)`,
        category: category,
        currentStock: data.totalStock
      });
    }
  }
  
  return report;
}

/**
 * Export stock data to CSV format
 */
function exportStockToCSV() {
  const db = loadDatabase();
  if (!db || !db.produk) {
    return null;
  }
  
  let csv = 'Product ID,Product Name,Category,Current Stock,Stock Status,Total Sold,Price Bronze,Price Silver,Price Gold,Last Restock\n';
  
  for (const [productId, product] of Object.entries(db.produk)) {
    const metrics = calculateStockMetrics(product);
    const lastRestock = product.lastRestock || 'Never';
    
    csv += `"${productId}","${product.name}","${metrics.category}",${metrics.stockCount},"${metrics.stockStatus}",${product.terjual || 0},${product.priceB || 0},${product.priceS || 0},${product.priceG || 0},"${lastRestock}"\n`;
  }
  
  return csv;
}

module.exports = {
  loadDatabase,
  saveDatabase,
  getStockStatus,
  getProductCategory,
  parseStockItem,
  validateStockItem,
  calculateStockMetrics,
  getStockAnalytics,
  generateStockReport,
  exportStockToCSV
}; 