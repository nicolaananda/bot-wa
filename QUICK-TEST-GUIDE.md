# Quick Test Guide - Modular System

## 🧪 Testing the New Modular System

### 1. **Switch to Optimized Version**
`ash
# Backup current index.js (if not done)
cp index.js index-original.js

# Use the optimized version
cp index-optimized.js index.js
`

### 2. **Test Commands**

#### **Menu Command** (.menu)
- Should load from src/commands/menu/main.js
- Test: Send '.menu' in WhatsApp

#### **Saldo Command** (.saldo)
- Should load from src/commands/general/saldo.js
- Test: Send '.saldo' in WhatsApp

#### **Stock Command** (.stok)
- Should load from src/commands/store/stok.js
- Test: Send '.stok' in WhatsApp

#### **Buy Command** (.buy)
- Should load from src/commands/store/buy.js
- Test: Send '.buy productid 1' in WhatsApp

### 3. **Check Performance**

#### **Before vs After**
- Monitor memory usage
- Check response times
- Look for error reduction

#### **Console Output**
- Should see: '📚 Loaded X commands from Y categories'
- Commands should log: 'CMD: commandname from username'

### 4. **Troubleshooting**

#### **If commands don't work:**
1. Check console for errors
2. Ensure command files are in correct directories
3. Verify command syntax in files

#### **If system fails:**
`ash
# Revert to original
cp index-original.js index.js
`

### 5. **Adding New Commands**

Create file: src/commands/category/newcommand.js
`javascript
module.exports = {
    name: ['test'],
    description: 'Test command',
    category: 'general',
    
    async execute(ctx) {
        await ctx.reply('✅ New modular system working!');
    }
};
`

Restart bot and test: .test

---

**Expected Results:**
- ✅ Faster response times
- ✅ Lower memory usage  
- ✅ Better error handling
- ✅ Easier to maintain
- ✅ 97% smaller main file
