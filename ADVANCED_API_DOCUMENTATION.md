# Advanced Dashboard API Documentation

## Overview

This document provides comprehensive documentation for all advanced dashboard API endpoints created for your WhatsApp Bot business analytics platform.

## Base URL
```
http://localhost:3002/api/dashboard
https://dash.nicola.id/api/dashboard
```

## Authentication
All endpoints are currently open. Add authentication middleware as needed.

---

## 🔧 Basic Endpoints

### 1. Dashboard Overview
```
GET /api/dashboard/overview
```
**Description:** Get basic dashboard metrics and overview data.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "totalTransactions": 1250,
    "totalRevenue": 15750000,
    "totalProfit": 315000,
    "activeUsers": 85
  }
}
```

### 2. Daily Chart Data
```
GET /api/dashboard/chart/daily
```
**Description:** Get daily transaction and revenue data for charts.

### 3. Monthly Chart Data
```
GET /api/dashboard/chart/monthly
```
**Description:** Get monthly aggregated data for trend analysis.

### 4. User Activity
```
GET /api/dashboard/users/activity
```
**Description:** Get user activity metrics and recent user data.

### 5. All Users (Paginated)
```
GET /api/dashboard/users/all?page=1&limit=10&search=&role=all
```
**Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10, max: 50)
- `search` (optional): Search by username or user ID
- `role` (optional): Filter by user role (bronze/silver/gold/all)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 15,
      "totalUsers": 150,
      "usersPerPage": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### 6. User Transactions
```
GET /api/dashboard/users/:userId/transactions
```
**Description:** Get all transactions for a specific user.

### 7. Search Transaction by Reference ID
```
GET /api/dashboard/transactions/search/:reffId
```
**Description:** Find transaction details by reference ID.

### 8. Recent Transactions
```
GET /api/dashboard/transactions/recent?limit=20
```
**Description:** Get most recent transactions across all users.

---

## 📊 Advanced Statistics & Analytics

### 9. Advanced Analytics Dashboard
```
GET /api/dashboard/analytics/advanced
```
**Description:** Comprehensive analytics with advanced metrics, trends, and insights.

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalUsers": 150,
      "totalTransactions": 1250,
      "totalRevenue": 15750000,
      "totalProfit": 315000,
      "avgLTV": 105000
    },
    "distributions": {
      "roles": {
        "bronze": 120,
        "silver": 25,
        "gold": 5
      },
      "paymentMethods": {
        "Saldo": 800,
        "QRIS": 450
      }
    },
    "trends": {
      "monthly": [...],
      "hourlyActivity": [...]
    },
    "topProducts": [...],
    "userMetrics": {
      "totalCustomers": 145,
      "averageOrderValue": 12600,
      "repeatCustomers": 89
    }
  }
}
```

### 10. Product Performance Analytics
```
GET /api/dashboard/products/performance
```
**Description:** Detailed product performance analysis with metrics, categories, and insights.

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "net2u",
        "name": "NETFLIX 1 BULAN 1P2U BEST SELLER🔥",
        "category": "Streaming",
        "prices": {
          "bronze": 12000,
          "silver": 13700,
          "gold": 13700
        },
        "stock": {
          "current": 8,
          "status": "in_stock"
        },
        "sales": {
          "totalSold": 289,
          "totalRevenue": 3958300,
          "totalProfit": 79166,
          "avgOrderValue": 13700
        },
        "metrics": {
          "conversionRate": 97.31,
          "profitMargin": 2.0,
          "stockTurnover": 36.13
        }
      }
    ],
    "summary": {...},
    "insights": {
      "topByRevenue": [...],
      "topByProfit": [...],
      "topByConversion": [...],
      "lowStock": [...]
    }
  }
}
```

### 11. User Behavior Analytics
```
GET /api/dashboard/users/behavior
```
**Description:** Advanced user behavior analysis with segmentation and insights.

**Response:**
```json
{
  "success": true,
  "data": {
    "segments": {
      "new": [...],      // 0-1 transactions
      "regular": [...],  // 2-5 transactions
      "loyal": [...],    // 6-10 transactions
      "vip": [...]       // 11+ transactions
    },
    "segmentStats": {
      "new": {
        "count": 65,
        "totalSpent": 890000,
        "avgSpent": 13692,
        "avgTransactions": 0.8,
        "percentage": 43.3
      }
    },
    "churnAnalysis": {
      "churnedUsers": 23,
      "churnRate": 15.3,
      "recentlyActive": 127
    },
    "insights": {
      "paymentPreferences": {...},
      "mostActiveHour": {...},
      "topSpenders": [...],
      "mostFrequentBuyers": [...]
    }
  }
}
```

### 12. Financial Analytics & Insights
```
GET /api/dashboard/finance/analytics
```
**Description:** Comprehensive financial analysis with revenue, profit, and growth metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalRevenue": 15750000,
      "totalProfit": 315000,
      "profitMargin": 2.0,
      "avgOrderValue": 12600,
      "totalTransactions": 1250,
      "revenueGrowthRate": 15.3
    },
    "distributions": {
      "byPaymentMethod": {...},
      "byUserRole": {...},
      "profitByRole": {...}
    },
    "trends": {
      "daily": [...],
      "monthly": {...}
    },
    "userFinances": {
      "totalBalance": 2450000,
      "avgBalance": 16333,
      "balanceDistribution": {...}
    },
    "insights": {
      "healthScore": 85.5,
      "recommendations": [...]
    }
  }
}
```

### 13. Real-time Dashboard Data
```
GET /api/dashboard/realtime
```
**Description:** Real-time metrics and live dashboard data.

**Response:**
```json
{
  "success": true,
  "data": {
    "timestamp": "2025-01-20T10:30:00.000Z",
    "today": {
      "transactions": 45,
      "revenue": 567000,
      "avgOrderValue": 12600,
      "topProducts": [...]
    },
    "last24h": {
      "transactions": 52,
      "revenue": 655200
    },
    "realtime": {
      "activeUsers": 23,
      "totalUsers": 150,
      "conversionRate": 15.33,
      "hourlyData": [...]
    },
    "recent": {
      "transactions": [...]
    },
    "alerts": [...]
  }
}
```

### 14. Predictive Analytics
```
GET /api/dashboard/predictions
```
**Description:** AI-powered predictions for revenue, user growth, and inventory needs.

**Response:**
```json
{
  "success": true,
  "data": {
    "revenue": {
      "historical": [...],
      "predicted": {
        "nextMonth": 1875000,
        "confidence": "high"
      }
    },
    "users": {
      "historical": [...],
      "predicted": {
        "nextMonthNewUsers": 25,
        "totalPredicted": 175
      }
    },
    "inventory": {
      "stockPredictions": [...],
      "totalRecommendedStock": 450
    },
    "churnRisk": {
      "highRisk": 12,
      "mediumRisk": 28,
      "usersAtRisk": [...]
    },
    "trends": {
      "categories": {...},
      "insights": [...]
    },
    "recommendations": [...]
  }
}
```

---

## 📦 Stock Management Endpoints

### 15. Product Stock Overview
```
GET /api/dashboard/products/stock
```
**Description:** Get all products with stock information and metrics.

### 16. Stock Summary
```
GET /api/dashboard/products/stock/summary
```
**Description:** Get stock summary statistics and category breakdown.

### 17. Update Product Stock
```
PUT /api/dashboard/products/:productId/stock
```
**Request Body:**
```json
{
  "action": "add", // or "remove"
  "stockItems": [
    "email@example.com|password123|profile1|pin1234|notes",
    "email2@example.com|password456|profile2|pin5678|notes2"
  ],
  "notes": "Restocked from supplier XYZ"
}
```

### 18. Stock Alerts
```
GET /api/dashboard/products/stock/alerts
```
**Description:** Get low stock and out-of-stock alerts with urgency levels.

### 19. Product Stock History
```
GET /api/dashboard/products/:productId/stock/history
```
**Description:** Get stock movement history for a specific product.

### 20. Stock Analytics
```
GET /api/dashboard/products/stock/analytics
```
**Description:** Advanced stock analytics and insights.

### 21. Stock Report
```
GET /api/dashboard/products/stock/report
```
**Description:** Generate comprehensive stock report.

### 22. Export Stock Data
```
GET /api/dashboard/products/stock/export
```
**Description:** Export stock data as CSV file.

### 23. Bulk Stock Update
```
POST /api/dashboard/products/stock/bulk-update
```
**Request Body:**
```json
{
  "updates": [
    {
      "productId": "net2u",
      "action": "add",
      "stockItems": [...],
      "notes": "Bulk restock"
    }
  ]
}
```

### 24. Product Stock Details
```
GET /api/dashboard/products/:productId/stock/details
```
**Description:** Get detailed stock information for a specific product.

---

## 📈 Key Features

### Advanced Analytics
- **User Segmentation:** Automatic categorization into New, Regular, Loyal, and VIP users
- **Behavioral Analysis:** Purchase patterns, preferred hours, payment methods
- **Churn Prediction:** Identify users at risk of leaving
- **Financial Health:** Profit margins, growth rates, revenue analysis

### Real-time Monitoring
- **Live Metrics:** Current day performance tracking
- **Hourly Breakdowns:** Activity patterns throughout the day
- **Recent Activity:** Latest transactions and user actions
- **Performance Alerts:** Automated warnings for low performance

### Predictive Intelligence
- **Revenue Forecasting:** ML-based revenue predictions
- **Stock Optimization:** Demand forecasting for inventory
- **User Growth:** New user acquisition predictions
- **Market Trends:** Category performance analysis

### Stock Management
- **Inventory Tracking:** Real-time stock levels
- **Automated Alerts:** Low stock notifications
- **Bulk Operations:** Mass stock updates
- **Performance Metrics:** Stock turnover and utilization

## 🎯 Dashboard Visualization Ideas

### Charts & Graphs
1. **Revenue Trend Line:** Monthly/daily revenue with predictions
2. **User Segmentation Pie Chart:** Distribution of user types
3. **Product Performance Bar Chart:** Top products by revenue/profit
4. **Hourly Activity Heatmap:** User activity patterns
5. **Payment Method Distribution:** Preferred payment methods
6. **Stock Status Indicators:** Visual stock level alerts
7. **Churn Risk Gauge:** Customer retention metrics
8. **Financial Health Score:** Overall business performance

### KPI Cards
- Total Revenue & Growth Rate
- Active Users & Conversion Rate
- Average Order Value
- Profit Margin
- Stock Turnover Rate
- Customer Lifetime Value
- Churn Rate
- Financial Health Score

### Interactive Elements
- Date range selectors
- User segment filters
- Product category filters
- Real-time refresh toggles
- Export buttons
- Drill-down capabilities

## 🚀 Implementation Tips

1. **Performance:** Use pagination for large datasets
2. **Caching:** Implement Redis caching for frequently accessed data
3. **Real-time:** Consider WebSocket connections for live updates
4. **Security:** Add authentication and rate limiting
5. **Monitoring:** Implement logging and error tracking
6. **Scalability:** Use database indexing for better query performance

## 📞 Support

For questions about implementation or customization, refer to the main dashboard-api.js file or contact the development team. 