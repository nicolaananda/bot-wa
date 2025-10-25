# 🎯 Business Flow Diagrams

## 📱 User Chat to Bot Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                             │
└─────────────────────────────────────────────────────────────────┘

1. User opens WhatsApp
   │
   ▼
2. User sends ".buy" to bot
   │
   ▼
3. Bot receives message
   │
   ▼
4. Bot checks rate limit (Redis)
   │
   ▼
5. Bot acquires transaction lock (Redis)
   │
   ▼
6. Bot checks user balance (PostgreSQL)
   │
   ▼
7. Bot checks product stock (PostgreSQL)
   │
   ▼
8. Bot generates payment link (Midtrans)
   │
   ▼
9. Bot sends payment link to user
   │
   ▼
10. User completes payment
    │
    ▼
11. Midtrans sends webhook to bot
    │
    ▼
12. Bot updates transaction status
    │
    ▼
13. Bot releases transaction lock
    │
    ▼
14. Bot sends confirmation to user
```

## 🔄 System Architecture Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   WhatsApp  │    │   Bot       │    │  PostgreSQL │
│   User      │◄──►│   Server    │◄──►│  Database   │
│             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │   Redis     │
                   │   Cache     │
                   │             │
                   └─────────────┘
                           │
                           ▼
                   ┌─────────────┐
                   │  Midtrans   │
                   │  Payment    │
                   │  Gateway    │
                   └─────────────┘
```

## 🔒 Transaction Locking Flow

```
User A: ".buy" ──┐
                │
                ▼
         ┌─────────────┐
         │ Acquire     │
         │ Lock:       │
         │ "buy:userA" │
         └─────────────┘
                │
                ▼
         ┌─────────────┐
         │ Lock       │
         │ Acquired   │
         │ Success    │
         └─────────────┘
                │
                ▼
         ┌─────────────┐
         │ Process    │
         │ Transaction│
         └─────────────┘
                │
                ▼
         ┌─────────────┐
         │ Release    │
         │ Lock       │
         └─────────────┘

User B: ".buy" ──┐
                │
                ▼
         ┌─────────────┐
         │ Try Acquire│
         │ Lock:      │
         │ "buy:userB"│
         └─────────────┘
                │
                ▼
         ┌─────────────┐
         │ Lock       │
         │ Already    │
         │ Exists     │
         └─────────────┘
                │
                ▼
         ┌─────────────┐
         │ Send       │
         │ "Transaction│
         │ in progress"│
         └─────────────┘
```

## 🛡️ Rate Limiting Flow

```
User sends command
        │
        ▼
┌─────────────┐
│ Redis Check │
│ "ratelimit: │
│ user:buy"   │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Increment   │
│ Counter     │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Check Count │
│ <= 3?       │
└─────────────┘
        │
        ▼
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌───────┐   ┌─────────┐
│ Count │   │ Count   │
│ <= 3  │   │ > 3     │
│       │   │         │
│ Allow │   │ Block   │
│ Request│   │ Request │
└───────┘   └─────────┘
    │           │
    ▼           ▼
┌───────┐   ┌─────────┐
│ Process│   │ Send    │
│ Command│   │ Rate    │
│       │   │ Limit   │
│       │   │ Warning │
└───────┘   └─────────┘
```

## 💾 Caching Strategy Flow

```
User: ".produk"
        │
        ▼
┌─────────────┐
│ Check Cache │
│ "produk:    │
│ list"       │
└─────────────┘
        │
        ▼
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌───────┐   ┌─────────┐
│ Cache │   │ Cache   │
│ Hit   │   │ Miss    │
│       │   │         │
│ Return│   │ Query   │
│ Cached│   │ Database│
│ Data  │   │         │
└───────┘   └─────────┘
                │
                ▼
         ┌─────────────┐
         │ Cache      │
         │ Data       │
         │ (5 min TTL)│
         └─────────────┘
                │
                ▼
         ┌─────────────┐
         │ Return     │
         │ Fresh Data │
         └─────────────┘
```

## 💳 Payment Processing Flow

```
User clicks payment link
        │
        ▼
┌─────────────┐
│ Midtrans    │
│ Payment     │
│ Page        │
└─────────────┘
        │
        ▼
┌─────────────┐
│ User        │
│ Completes   │
│ Payment     │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Midtrans    │
│ Sends       │
│ Webhook     │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Bot         │
│ Receives    │
│ Webhook     │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Verify      │
│ Payment     │
│ Status      │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Update      │
│ Database    │
│ Transaction │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Send        │
│ Confirmation│
│ to User     │
└─────────────┘
```

## 🔧 Error Handling Flow

```
System Error Occurs
        │
        ▼
┌─────────────┐
│ Log Error   │
│ to Console  │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Check Error │
│ Type        │
└─────────────┘
        │
        ▼
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌───────┐   ┌─────────┐
│ Redis │   │ Database│
│ Error │   │ Error   │
│       │   │         │
│ Fail  │   │ Send    │
│ Open  │   │ Error   │
│       │   │ Message │
└───────┘   └─────────┘
    │           │
    ▼           ▼
┌───────┐   ┌─────────┐
│ Continue│   │ Stop    │
│ Without│   │ Process │
│ Cache  │   │         │
└───────┘   └─────────┘
```

## 📊 Performance Monitoring Flow

```
System Running
        │
        ▼
┌─────────────┐
│ Collect     │
│ Metrics     │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Redis       │
│ Metrics:    │
│ - Cache Hit │
│ - Lock Rate │
│ - Rate Limit│
└─────────────┘
        │
        ▼
┌─────────────┐
│ Database    │
│ Metrics:    │
│ - Query Time│
│ - Connection│
│ - Error Rate│
└─────────────┘
        │
        ▼
┌─────────────┐
│ Bot         │
│ Metrics:    │
│ - Response  │
│ - Uptime    │
│ - Users     │
└─────────────┘
        │
        ▼
┌─────────────┐
│ Log to      │
│ Console     │
│ & Monitor   │
└─────────────┘
```

## 🎯 Key Business Rules

### **Transaction Rules**
1. **One transaction per user at a time** (Redis lock)
2. **Maximum 3 transactions per minute per user** (Rate limit)
3. **Stock validation before payment** (Database check)
4. **Balance validation before transaction** (User check)

### **Caching Rules**
1. **Product list cached for 5 minutes**
2. **User balance cached for 1 minute**
3. **Settings cached for 10 minutes**
4. **Transaction data never cached** (Real-time)

### **Error Handling Rules**
1. **Redis failure → Continue without cache**
2. **Database failure → Stop process**
3. **Payment failure → Rollback transaction**
4. **Network failure → Retry with backoff**

This architecture ensures reliable, scalable, and performant e-commerce operations through WhatsApp bot integration.
