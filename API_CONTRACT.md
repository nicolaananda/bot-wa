# Dashboard API Contract

## Overview
This document outlines the API contract for the Dashboard API server. The API provides endpoints for dashboard data, charts, user management, and transaction analytics.

**Base URL:** `http://localhost:3000` (or `process.env.REACT_APP_API_URL`)

## Authentication
Currently, the API does not require authentication. All endpoints are publicly accessible.

## Response Format
All API responses follow this standard format:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

## Endpoints

### 1. Dashboard Overview
**GET** `/api/dashboard/overview`

Returns comprehensive dashboard overview data including statistics, charts, and summary information.

**Response:**
```typescript
interface DashboardOverviewResponse {
  success: true;
  data: {
    totalUsers: number;
    totalTransactions: number;
    totalRevenue: number;
    totalProfit: number;
    recentActivity: Array<{
      type: string;
      description: string;
      timestamp: string;
    }>;
    quickStats: {
      todayRevenue: number;
      todayTransactions: number;
      monthlyGrowth: number;
      userGrowth: number;
    };
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "totalTransactions": 1250,
    "totalRevenue": 50000000,
    "totalProfit": 2500000,
    "recentActivity": [
      {
        "type": "transaction",
        "description": "New transaction from user123",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ],
    "quickStats": {
      "todayRevenue": 1500000,
      "todayTransactions": 45,
      "monthlyGrowth": 12.5,
      "userGrowth": 8.2
    }
  }
}
```

### 2. Daily Chart Data
**GET** `/api/dashboard/chart/daily`

Returns daily chart data for revenue and transaction trends.

**Response:**
```typescript
interface DailyChartResponse {
  success: true;
  data: {
    labels: string[]; // Date labels
    revenue: number[]; // Daily revenue
    transactions: number[]; // Daily transaction count
    profit: number[]; // Daily profit
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "labels": ["2024-01-10", "2024-01-11", "2024-01-12"],
    "revenue": [1500000, 1800000, 1200000],
    "transactions": [45, 52, 38],
    "profit": [75000, 90000, 60000]
  }
}
```

### 3. Monthly Chart Data
**GET** `/api/dashboard/chart/monthly`

Returns monthly chart data for revenue and transaction trends.

**Response:**
```typescript
interface MonthlyChartResponse {
  success: true;
  data: {
    labels: string[]; // Month labels
    revenue: number[]; // Monthly revenue
    transactions: number[]; // Monthly transaction count
    profit: number[]; // Monthly profit
    userGrowth: number[]; // Monthly user growth
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "labels": ["Jan 2024", "Feb 2024", "Mar 2024"],
    "revenue": [45000000, 52000000, 48000000],
    "transactions": [1350, 1580, 1420],
    "profit": [2250000, 2600000, 2400000],
    "userGrowth": [120, 135, 150]
  }
}
```

### 4. User Activity
**GET** `/api/dashboard/users/activity`

Returns user activity data including login patterns and transaction behavior.

**Response:**
```typescript
interface UserActivityResponse {
  success: true;
  data: {
    activeUsers: number;
    newUsers: number;
    userActivity: Array<{
      userId: string;
      username: string;
      lastActivity: string;
      transactionCount: number;
      totalSpent: number;
      role: string;
    }>;
    activityTrends: {
      dailyActive: number[];
      weeklyActive: number[];
      monthlyActive: number[];
    };
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "activeUsers": 89,
    "newUsers": 12,
    "userActivity": [
      {
        "userId": "user123",
        "username": "john_doe",
        "lastActivity": "2024-01-15T10:30:00Z",
        "transactionCount": 25,
        "totalSpent": 2500000,
        "role": "silver"
      }
    ],
    "activityTrends": {
      "dailyActive": [45, 52, 38, 41, 47, 39, 43],
      "weeklyActive": [89, 92, 87, 94],
      "monthlyActive": [150, 145, 158]
    }
  }
}
```

### 5. User Transactions
**GET** `/api/dashboard/users/:userId/transactions`

Returns all transactions for a specific user.

**Parameters:**
- `userId` (path): The user ID to fetch transactions for

**Response:**
```typescript
interface UserTransactionsResponse {
  success: true;
  data: {
    user: string;
    totalTransaksi: number;
    totalSpent: number;
    transaksi: Array<{
      id: string;
      name: string;
      price: number;
      date: string;
      jumlah: number;
      metodeBayar: string;
      totalBayar: number;
      reffId: string;
    }>;
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "user": "user123",
    "totalTransaksi": 25,
    "totalSpent": 2500000,
    "transaksi": [
      {
        "id": "prod001",
        "name": "Product A",
        "price": 50000,
        "date": "2024-01-15",
        "jumlah": 2,
        "metodeBayar": "DANA",
        "totalBayar": 100000,
        "reffId": "REF123456"
      }
    ]
  }
}
```

### 6. Search Transaction by Reference ID
**GET** `/api/dashboard/transactions/search/:reffId`

Searches for a transaction using its reference ID.

**Parameters:**
- `reffId` (path): The reference ID to search for

**Response:**
```typescript
interface TransactionSearchResponse {
  success: true;
  data: {
    reffId: string;
    user: string;
    userRole: string;
    produk: string;
    idProduk: string;
    harga: number;
    jumlah: number;
    totalBayar: number;
    metodeBayar: string;
    tanggal: string;
    profit: number;
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "reffId": "REF123456",
    "user": "user123",
    "userRole": "silver",
    "produk": "Product A",
    "idProduk": "prod001",
    "harga": 50000,
    "jumlah": 2,
    "totalBayar": 100000,
    "metodeBayar": "DANA",
    "tanggal": "2024-01-15",
    "profit": 5000
  }
}
```

### 7. Export Data
**GET** `/api/dashboard/export/:format`

Exports dashboard data in the specified format.

**Parameters:**
- `format` (path): Export format (e.g., "json", "csv", "xlsx")

**Response:**
```typescript
interface ExportResponse {
  success: true;
  message: string;
  filename: string;
}
```

**Example Response:**
```json
{
  "success": true,
  "message": "Data berhasil diexport ke format json",
  "filename": "dashboard_2024-01-15T10-30-00.json"
}
```

### 8. User Statistics
**GET** `/api/dashboard/users/stats`

Returns comprehensive user statistics including role-based breakdowns.

**Response:**
```typescript
interface UserStatsResponse {
  success: true;
  data: {
    totalUsers: number;
    totalSaldo: number;
    userStats: {
      [role: string]: {
        count: number;
        totalSaldo: number;
      };
    };
    averageSaldo: number;
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "totalSaldo": 25000000,
    "userStats": {
      "bronze": {
        "count": 80,
        "totalSaldo": 8000000
      },
      "silver": {
        "count": 45,
        "totalSaldo": 9000000
      },
      "gold": {
        "count": 25,
        "totalSaldo": 8000000
      }
    },
    "averageSaldo": 166667
  }
}
```

### 9. Product Statistics
**GET** `/api/dashboard/products/stats`

Returns product performance statistics and rankings.

**Response:**
```typescript
interface ProductStatsResponse {
  success: true;
  data: {
    totalProducts: number;
    totalSold: number;
    products: Array<{
      id: string;
      name: string;
      totalSold: number;
      totalRevenue: number;
      averagePrice: number;
      transactionCount: number;
    }>;
    topProducts: Array<{
      id: string;
      name: string;
      totalSold: number;
      totalRevenue: number;
      averagePrice: number;
      transactionCount: number;
    }>;
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 25,
    "totalSold": 1250,
    "products": [
      {
        "id": "prod001",
        "name": "Product A",
        "totalSold": 150,
        "totalRevenue": 7500000,
        "averagePrice": 50000,
        "transactionCount": 75
      }
    ],
    "topProducts": [
      {
        "id": "prod001",
        "name": "Product A",
        "totalSold": 150,
        "totalRevenue": 7500000,
        "averagePrice": 50000,
        "transactionCount": 75
      }
    ]
  }
}
```

### 10. Recent Transactions
**GET** `/api/dashboard/transactions/recent`

Returns the most recent transactions with optional limit parameter.

**Query Parameters:**
- `limit` (optional): Number of transactions to return (default: 20)

**Response:**
```typescript
interface RecentTransactionsResponse {
  success: true;
  data: {
    transactions: Array<{
      id: string;
      name: string;
      price: number;
      date: string;
      jumlah: number;
      user: string;
      metodeBayar: string;
      totalBayar: number;
      reffId: string;
    }>;
    count: number;
    limit: number;
  };
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "prod001",
        "name": "Product A",
        "price": 50000,
        "date": "2024-01-15",
        "jumlah": 2,
        "user": "user123",
        "metodeBayar": "DANA",
        "totalBayar": 100000,
        "reffId": "REF123456"
      }
    ],
    "count": 1,
    "limit": 20
  }
}
```

## Error Handling

### Standard Error Response
```typescript
interface ErrorResponse {
  success: false;
  error: string;
}
```

### Common HTTP Status Codes
- `200` - Success
- `400` - Bad Request
- `404` - Not Found
- `500` - Internal Server Error

### Example Error Response
```json
{
  "success": false,
  "error": "Failed to load database"
}
```

## React Usage Examples

### Using Fetch API
```typescript
// Dashboard Overview
const fetchDashboardOverview = async () => {
  try {
    const response = await fetch('/api/dashboard/overview');
    const data = await response.json();
    
    if (data.success) {
      return data.data;
    } else {
      throw new Error(data.error);
    }
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    throw error;
  }
};
```

### Using Axios
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000',
  timeout: 10000,
});

// Dashboard Overview
const fetchDashboardOverview = async () => {
  try {
    const response = await api.get('/api/dashboard/overview');
    return response.data.data;
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    throw error;
  }
};

// User Transactions
const fetchUserTransactions = async (userId: string) => {
  try {
    const response = await api.get(`/api/dashboard/users/${userId}/transactions`);
    return response.data.data;
  } catch (error) {
    console.error('Error fetching user transactions:', error);
    throw error;
  }
};
```

### React Hook Example
```typescript
import { useState, useEffect } from 'react';

interface DashboardData {
  totalUsers: number;
  totalTransactions: number;
  totalRevenue: number;
  totalProfit: number;
}

const useDashboardOverview = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/dashboard/overview');
        const result = await response.json();
        
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { data, loading, error };
};
```

## TypeScript Interfaces

For complete type safety, you can create a types file:

```typescript
// types/dashboard.ts

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DashboardOverview {
  totalUsers: number;
  totalTransactions: number;
  totalRevenue: number;
  totalProfit: number;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
  quickStats: {
    todayRevenue: number;
    todayTransactions: number;
    monthlyGrowth: number;
    userGrowth: number;
  };
}

export interface Transaction {
  id: string;
  name: string;
  price: number;
  date: string;
  jumlah: number;
  user: string;
  metodeBayar: string;
  totalBayar: number;
  reffId: string;
}

export interface UserStats {
  totalUsers: number;
  totalSaldo: number;
  userStats: {
    [role: string]: {
      count: number;
      totalSaldo: number;
    };
  };
  averageSaldo: number;
}

export interface ProductStats {
  id: string;
  name: string;
  totalSold: number;
  totalRevenue: number;
  averagePrice: number;
  transactionCount: number;
}
```

## Testing

### Using Postman/Insomnia
1. Set base URL: `http://localhost:3000`
2. Test each endpoint with the provided examples
3. Verify response format matches the contract

### Using Jest/Testing Library
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('/api/dashboard/overview', (req, res, ctx) => {
    return res(
      ctx.json({
        success: true,
        data: {
          totalUsers: 150,
          totalTransactions: 1250,
          totalRevenue: 50000000,
          totalProfit: 2500000,
          // ... other data
        },
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

test('renders dashboard overview', async () => {
  render(<DashboardOverview />);
  
  await waitFor(() => {
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('1,250')).toBeInTheDocument();
  });
});
```

## Notes

1. **CORS**: The API has CORS enabled for cross-origin requests
2. **Error Handling**: Always check the `success` field in responses
3. **Data Types**: All numeric values are returned as numbers, not strings
4. **Date Format**: Dates are returned in ISO 8601 format
5. **Pagination**: Currently, only the recent transactions endpoint supports limiting results
6. **Real-time Updates**: The API does not support WebSocket connections for real-time updates

## Support

For API-related issues or questions, please refer to the backend team or check the server logs for detailed error information. 