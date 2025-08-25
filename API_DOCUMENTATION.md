# API Documentation - Dashboard System

## Overview
This document provides comprehensive API documentation for the Dashboard System backend API. The API is built with Express.js and provides endpoints for managing users, transactions, products, and stock management.

## Base URL
- **Development**: `http://localhost:3002`
- **Production**: `https://dash.nicola.id:3002` (HTTP)

## Authentication
Currently, the API does not implement authentication. All endpoints are publicly accessible.

## Response Format
All API responses follow this standard format:

```json
{
  "success": true/false,
  "data": {...},
  "message": "Optional message",
  "error": "Error message if success is false"
}
```

## Error Handling
- **200**: Success
- **400**: Bad Request (invalid parameters)
- **404**: Not Found
- **500**: Internal Server Error

---

## 1. Dashboard Overview

### GET `/api/dashboard/overview`
Get comprehensive dashboard overview data including transactions, revenue, and user statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalTransaksi": 150,
    "totalPendapatan": 2500000,
    "transaksiHariIni": 12,
    "pendapatanHariIni": 180000,
    "metodeBayar": {
      "saldo": 45,
      "qris": 89,
      "unknown": 16
    },
    "topUsers": [
      {
        "user": "user123",
        "transaksi": 15,
        "totalSpent": 250000
      }
    ],
    "chartData": {
      "daily": {...},
      "monthly": {...},
      "userActivity": {...}
    }
  }
}
```

---

## 2. Chart Data

### GET `/api/dashboard/chart/daily`
Get daily chart data for the last 7 days.

**Response:**
```json
{
  "success": true,
  "data": {
    "2024-01-01": {
      "transaksi": 15,
      "pendapatan": 250000
    },
    "2024-01-02": {
      "transaksi": 18,
      "pendapatan": 300000
    }
  }
}
```

### GET `/api/dashboard/chart/monthly`
Get monthly chart data for the current year.

**Response:**
```json
{
  "success": true,
  "data": {
    "2024-01": {
      "transaksi": 450,
      "pendapatan": 7500000
    },
    "2024-02": {
      "transaksi": 520,
      "pendapatan": 8200000
    }
  }
}
```

---

## 3. User Management

### GET `/api/dashboard/users/activity`
Get user activity data including active users, new users, and activity trends.

**Response:**
```json
{
  "success": true,
  "data": {
    "activeUsers": 1250,
    "newUsers": 45,
    "userActivity": [
      {
        "user": "user123",
        "username": "John Doe",
        "totalTransaksi": 15,
        "totalSpent": 250000,
        "saldo": 50000,
        "lastActivity": "2024-01-15T10:30:00Z",
        "role": "silver",
        "metodeBayar": {
          "saldo": 8,
          "qris": 7,
          "unknown": 0
        }
      }
    ],
    "activityTrends": {
      "dailyActive": [120, 135, 142, 128, 156, 149, 138],
      "weeklyActive": [890, 920, 945, 912, 978, 934, 956],
      "monthlyActive": [2800, 2950, 3100, 3020, 3180, 3050, 3120]
    }
  }
}
```

### GET `/api/dashboard/users/all`
Get all users with pagination, search, and role filtering.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Users per page (default: 10, max: 50)
- `search` (optional): Search term for username or user ID
- `role` (optional): Filter by role (bronze, silver, gold, all)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userId": "user123",
        "username": "John Doe",
        "phone": "user123",
        "email": "user123@example.com",
        "saldo": 50000,
        "role": "silver",
        "isActive": true,
        "lastActivity": "2024-01-15T10:30:00Z",
        "createdAt": "2024-01-01T00:00:00Z",
        "transactionCount": 15,
        "totalSpent": 250000,
        "hasTransactions": true
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalUsers": 1250,
      "usersPerPage": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### GET `/api/dashboard/users/:userId/transactions`
Get all transactions for a specific user.

**Path Parameters:**
- `userId`: User ID (can be with or without @s.whatsapp.net)

**Response:**
```json
{
  "success": true,
  "data": {
    "user": "User user123@s.whatsapp.net",
    "userId": "user123",
    "totalTransaksi": 15,
    "totalSpent": 250000,
    "currentSaldo": 50000,
    "transaksi": [
      {
        "id": "txn_123",
        "referenceId": "REF-123",
        "reffId": "REF-123",
        "order_id": "ORD-123",
        "name": "Netflix Premium",
        "jumlah": 1,
        "price": 15000,
        "totalBayar": 15000,
        "date": "2024-01-15T10:30:00Z",
        "payment_method": "Saldo",
        "metodeBayar": "Saldo",
        "status": "completed"
      }
    ]
  }
}
```

### GET `/api/dashboard/users/stats`
Get comprehensive user statistics including growth rates and distributions.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 1250,
    "totalSaldo": 62500000,
    "averageSaldo": 50000,
    "userGrowth": {
      "thisMonth": 45,
      "lastMonth": 38,
      "growthRate": 18.4
    },
    "roleDistribution": {
      "bronze": 800,
      "silver": 350,
      "gold": 100
    },
    "balanceDistribution": {
      "high": 200,
      "medium": 450,
      "low": 600
    }
  }
}
```

---

## 4. Transaction Management

### GET `/api/dashboard/transactions/search/:reffId`
Search for a transaction by reference ID.

**Path Parameters:**
- `reffId`: Reference ID to search for

**Response:**
```json
{
  "success": true,
  "data": {
    "reffId": "REF-123",
    "user": "John Doe",
    "metodeBayar": "Saldo",
    "userRole": "silver",
    "produk": "Netflix Premium",
    "idProduk": "netflix_premium",
    "harga": 15000,
    "jumlah": 1,
    "totalBayar": 15000,
    "tanggal": "2024-01-15T10:30:00Z",
    "profit": 300
  }
}
```

### GET `/api/dashboard/transactions/recent`
Get recent transactions with optional limit.

**Query Parameters:**
- `limit` (optional): Number of transactions to return (default: 20)

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "txn_123",
        "name": "Netflix Premium",
        "price": 15000,
        "date": "2024-01-15T10:30:00Z",
        "jumlah": 1,
        "user": "John Doe",
        "metodeBayar": "Saldo",
        "totalBayar": 15000,
        "reffId": "REF-123"
      }
    ],
    "count": 20,
    "limit": 20
  }
}
```

---

## 5. Product Management

### GET `/api/dashboard/products/stats`
Get product statistics including sales and revenue data.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 25,
    "totalSold": 1250,
    "products": [
      {
        "id": "netflix_premium",
        "name": "Netflix Premium",
        "totalSold": 150,
        "totalRevenue": 2250000,
        "averagePrice": 15000,
        "transactionCount": 150
      }
    ],
    "topProducts": [...]
  }
}
```

---

## 6. Stock Management

### GET `/api/dashboard/products/stock`
Get comprehensive stock data for all products.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 25,
    "totalSold": 1250,
    "products": [
      {
        "id": "netflix_premium",
        "name": "Netflix Premium",
        "desc": "Netflix Premium Subscription",
        "priceB": 15000,
        "priceS": 14000,
        "priceG": 13000,
        "terjual": 150,
        "stockCount": 25,
        "stok": ["email1|pass1|profile1|pin1|notes1", ...],
        "stockStatus": "good",
        "category": "Streaming",
        "minStock": 5,
        "lastRestock": "2024-01-10T08:00:00Z",
        "utilization": 86
      }
    ],
    "topProducts": [...]
  }
}
```

### GET `/api/dashboard/products/stock/summary`
Get stock summary including counts and categories.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 25,
    "totalStockItems": 1250,
    "lowStockProducts": 3,
    "outOfStockProducts": 1,
    "categories": ["Streaming", "Software", "Gaming"],
    "stockByCategory": {
      "Streaming": 800,
      "Software": 300,
      "Gaming": 150
    }
  }
}
```

### PUT `/api/dashboard/products/:productId/stock`
Update product stock (add or remove items).

**Path Parameters:**
- `productId`: Product ID to update

**Request Body:**
```json
{
  "action": "add|remove",
  "stockItems": ["email1|pass1|profile1|pin1|notes1"],
  "notes": "Optional notes about the update"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "netflix_premium",
    "previousStockCount": 25,
    "newStockCount": 26,
    "addedItems": 1,
    "removedItems": 0,
    "updatedAt": "2024-01-15T10:30:00Z",
    "notes": "Added new stock"
  }
}
```

### GET `/api/dashboard/products/stock/alerts`
Get low stock alerts for products.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalAlerts": 4,
    "criticalAlerts": 1,
    "highAlerts": 2,
    "mediumAlerts": 1,
    "alerts": [
      {
        "productId": "netflix_premium",
        "productName": "Netflix Premium",
        "currentStock": 0,
        "threshold": 5,
        "status": "out",
        "category": "Streaming",
        "lastRestock": "2024-01-10T08:00:00Z",
        "urgency": "critical"
      }
    ]
  }
}
```

### GET `/api/dashboard/products/:productId/stock/history`
Get stock history for a specific product.

**Path Parameters:**
- `productId`: Product ID to get history for

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "netflix_premium",
    "productName": "Netflix Premium",
    "currentStock": 25,
    "history": [
      {
        "type": "restock",
        "timestamp": "2024-01-10T08:00:00Z",
        "description": "Stock added to product",
        "quantity": 25
      }
    ]
  }
}
```

### GET `/api/dashboard/products/stock/analytics`
Get advanced stock analytics.

**Response:**
```json
{
  "success": true,
  "data": {
    "stockUtilization": 85.5,
    "turnoverRate": 12.3,
    "categoryPerformance": {
      "Streaming": {
        "utilization": 90.2,
        "turnoverRate": 15.6
      }
    }
  }
}
```

### GET `/api/dashboard/products/stock/report`
Generate comprehensive stock report.

**Response:**
```json
{
  "success": true,
  "data": {
    "reportDate": "2024-01-15T10:30:00Z",
    "summary": {
      "totalProducts": 25,
      "totalStock": 1250,
      "lowStockCount": 3,
      "outOfStockCount": 1
    },
    "categoryBreakdown": {...},
    "recommendations": [...]
  }
}
```

### GET `/api/dashboard/products/stock/export`
Export stock data to CSV format.

**Response:** CSV file download

### POST `/api/dashboard/products/stock/bulk-update`
Perform bulk stock updates for multiple products.

**Request Body:**
```json
{
  "updates": [
    {
      "productId": "netflix_premium",
      "action": "add",
      "stockItems": ["email1|pass1|profile1|pin1|notes1"],
      "notes": "Bulk update"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUpdates": 1,
    "successfulUpdates": 1,
    "failedUpdates": 0,
    "results": [
      {
        "productId": "netflix_premium",
        "success": true,
        "previousStockCount": 25,
        "newStockCount": 26,
        "action": "add",
        "itemsProcessed": 1
      }
    ]
  }
}
```

### GET `/api/dashboard/products/:productId/stock/details`
Get detailed stock information for a specific product.

**Path Parameters:**
- `productId`: Product ID to get details for

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "netflix_premium",
    "productName": "Netflix Premium",
    "description": "Netflix Premium Subscription",
    "prices": {
      "bronze": 15000,
      "silver": 14000,
      "gold": 13000
    },
    "sales": {
      "total": 150
    },
    "stock": {
      "count": 25,
      "status": "good",
      "items": [
        {
          "raw": "email1|pass1|profile1|pin1|notes1",
          "parsed": {
            "email": "email1",
            "password": "pass1",
            "profile": "profile1",
            "pin": "pin1",
            "notes": "notes1"
          },
          "isValid": true
        }
      ],
      "metrics": {...}
    },
    "category": "Streaming",
    "lastRestock": "2024-01-10T08:00:00Z",
    "terms": "Terms and conditions..."
  }
}
```

---

## 7. Data Export

### GET `/api/dashboard/export/:format`
Export dashboard data in specified format.

**Path Parameters:**
- `format`: Export format (json, csv, xlsx)

**Response:**
```json
{
  "success": true,
  "message": "Data berhasil diexport ke format json",
  "filename": "dashboard_2024-01-15T10-30-00.json"
}
```

---

## Data Models

### User Object
```json
{
  "userId": "string",
  "username": "string",
  "phone": "string",
  "email": "string",
  "saldo": "number",
  "role": "bronze|silver|gold",
  "isActive": "boolean",
  "lastActivity": "ISO date string",
  "createdAt": "ISO date string",
  "transactionCount": "number",
  "totalSpent": "number",
  "hasTransactions": "boolean"
}
```

### Transaction Object
```json
{
  "id": "string",
  "referenceId": "string",
  "reffId": "string",
  "order_id": "string",
  "name": "string",
  "jumlah": "number",
  "price": "number",
  "totalBayar": "number",
  "date": "ISO date string",
  "payment_method": "string",
  "metodeBayar": "string",
  "status": "string"
}
```

### Product Object
```json
{
  "id": "string",
  "name": "string",
  "desc": "string",
  "priceB": "number",
  "priceS": "number",
  "priceG": "number",
  "terjual": "number",
  "stockCount": "number",
  "stok": ["string"],
  "stockStatus": "out|low|medium|good",
  "category": "string",
  "minStock": "number",
  "lastRestock": "ISO date string",
  "utilization": "number"
}
```

### Stock Item Format
Stock items are stored as pipe-separated strings:
```
email|password|profile|pin|notes
```

Example:
```
user@example.com|password123|profile1|1234|Premium account
```

---

## Rate Limiting
Currently, no rate limiting is implemented. Implement appropriate rate limiting in production.

## CORS Configuration
The API allows requests from:
- `http://dash.nicola.id`
- `https://dash.nicola.id`
- `http://localhost:8080`
- `http://localhost:3002`

## Development Notes

### Starting the API Server
```bash
# Development mode
npm run dashboard:dev

# Production mode
npm run dashboard
```

### Environment Variables
- `PORT`: HTTP port (default: 3002)

### Database
The API uses a JSON file-based database located at `options/database.json`. The database structure includes:
- `users`: User data
- `transaksi`: Transaction data
- `produk`: Product data
- `profit`: Profit data
- `persentase`: Percentage data for different user roles

### Error Handling
All endpoints include proper error handling with appropriate HTTP status codes and error messages.

### Logging
The API includes console logging for debugging and monitoring purposes.

---

## Frontend Integration Examples

### React Hook Example
```javascript
import { useState, useEffect } from 'react';

const useDashboardData = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:3002/api/dashboard/overview');
        const result = await response.json();
        
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
};
```

### Fetch with Error Handling
```javascript
const fetchWithErrorHandling = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'API request failed');
    }

    return data.data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// Usage
const getUsers = async (page = 1, limit = 10) => {
  return await fetchWithErrorHandling(
    `http://localhost:3002/api/dashboard/users/all?page=${page}&limit=${limit}`
  );
};
```

### Stock Update Example
```javascript
const updateStock = async (productId, action, stockItems, notes) => {
  return await fetchWithErrorHandling(
    `http://localhost:3002/api/dashboard/products/${productId}/stock`,
    {
      method: 'PUT',
      body: JSON.stringify({
        action,
        stockItems,
        notes
      })
    }
  );
};

// Usage
const addStock = async () => {
  try {
    const result = await updateStock(
      'netflix_premium',
      'add',
      ['newuser@example.com|password123|profile1|1234|New account'],
      'Added new stock'
    );
    console.log('Stock updated:', result);
  } catch (error) {
    console.error('Failed to update stock:', error);
  }
};
```

---

## Support
For technical support or questions about the API, please refer to the codebase or contact the development team.

## Version History
- **v1.0.0**: Initial API release with dashboard, user, transaction, and stock management endpoints 