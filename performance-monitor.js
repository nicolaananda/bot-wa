#!/usr/bin/env node

/**
 * Performance Monitor untuk Command Cek Saldo
 * Script ini membantu monitoring performa command ceksaldo
 */

const fs = require('fs');
const path = require('path');

class PerformanceMonitor {
  constructor() {
    this.logFile = './logs/performance.log';
    this.ensureLogDirectory();
    this.performanceData = new Map();
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  startTimer(command, userId) {
    const startTime = process.hrtime.bigint();
    this.performanceData.set(`${command}_${userId}`, {
      startTime,
      command,
      userId,
      timestamp: new Date().toISOString()
    });
    return startTime;
  }

  endTimer(command, userId) {
    const key = `${command}_${userId}`;
    const data = this.performanceData.get(key);
    
    if (data) {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - data.startTime) / 1000000; // Convert to milliseconds
      
      const logEntry = {
        command: data.command,
        userId: data.userId,
        duration: duration.toFixed(2),
        timestamp: data.timestamp,
        endTime: new Date().toISOString(),
        performance: this.getPerformanceRating(duration)
      };

      this.logPerformance(logEntry);
      this.performanceData.delete(key);
      
      return duration;
    }
    
    return null;
  }

  getPerformanceRating(duration) {
    if (duration < 100) return 'EXCELLENT';
    if (duration < 500) return 'GOOD';
    if (duration < 1000) return 'AVERAGE';
    if (duration < 3000) return 'SLOW';
    return 'VERY_SLOW';
  }

  logPerformance(logEntry) {
    const logLine = `[${logEntry.timestamp}] ${logEntry.command} | User: ${logEntry.userId} | Duration: ${logEntry.duration}ms | Rating: ${logEntry.performance}\n`;
    
    fs.appendFileSync(this.logFile, logLine);
    
    // Console output for real-time monitoring
    const emoji = this.getPerformanceEmoji(logEntry.performance);
    console.log(`${emoji} ${logEntry.command} | User: ${logEntry.userId} | ${logEntry.duration}ms | ${logEntry.performance}`);
  }

  getPerformanceEmoji(rating) {
    const emojis = {
      'EXCELLENT': '🚀',
      'GOOD': '✅',
      'AVERAGE': '⚠️',
      'SLOW': '🐌',
      'VERY_SLOW': '❌'
    };
    return emojis[rating] || '❓';
  }

  generateReport() {
    if (!fs.existsSync(this.logFile)) {
      console.log('❌ No performance logs found');
      return;
    }

    const logs = fs.readFileSync(this.logFile, 'utf8').split('\n').filter(line => line.trim());
    
    if (logs.length === 0) {
      console.log('❌ No performance logs found');
      return;
    }

    const stats = {
      totalCommands: 0,
      averageDuration: 0,
      performanceBreakdown: {},
      userPerformance: {},
      slowestCommands: []
    };

    let totalDuration = 0;

    logs.forEach(log => {
      try {
        const parts = log.split(' | ');
        if (parts.length >= 3) {
          const command = parts[0].split(' ')[1];
          const userId = parts[1].split(': ')[1];
          const duration = parseFloat(parts[2].split(': ')[1]);
          const rating = parts[3].split(': ')[1];

          stats.totalCommands++;
          totalDuration += duration;

          // Performance breakdown
          if (!stats.performanceBreakdown[rating]) {
            stats.performanceBreakdown[rating] = 0;
          }
          stats.performanceBreakdown[rating]++;

          // User performance
          if (!stats.userPerformance[userId]) {
            stats.userPerformance[userId] = {
              count: 0,
              totalDuration: 0,
              averageDuration: 0
            };
          }
          stats.userPerformance[userId].count++;
          stats.userPerformance[userId].totalDuration += duration;

          // Track slowest commands
          stats.slowestCommands.push({
            command,
            userId,
            duration,
            rating,
            timestamp: parts[0].replace('[', '').replace(']', '')
          });
        }
      } catch (error) {
        // Skip malformed logs
      }
    });

    // Calculate averages
    stats.averageDuration = totalDuration / stats.totalCommands;

    // Sort slowest commands
    stats.slowestCommands.sort((a, b) => b.duration - a.duration);

    // Calculate user averages
    Object.keys(stats.userPerformance).forEach(userId => {
      const user = stats.userPerformance[userId];
      user.averageDuration = user.totalDuration / user.count;
    });

    // Display report
    console.log('\n📊 PERFORMANCE REPORT');
    console.log('='.repeat(50));
    console.log(`Total Commands: ${stats.totalCommands}`);
    console.log(`Average Duration: ${stats.averageDuration.toFixed(2)}ms`);
    console.log('\n🏆 Performance Breakdown:');
    
    Object.entries(stats.performanceBreakdown).forEach(([rating, count]) => {
      const percentage = ((count / stats.totalCommands) * 100).toFixed(1);
      console.log(`  ${this.getPerformanceEmoji(rating)} ${rating}: ${count} (${percentage}%)`);
    });

    console.log('\n🐌 Top 5 Slowest Commands:');
    stats.slowestCommands.slice(0, 5).forEach((cmd, index) => {
      console.log(`  ${index + 1}. ${cmd.command} | User: ${cmd.userId} | ${cmd.duration}ms | ${cmd.rating}`);
    });

    console.log('\n👥 User Performance Summary:');
    Object.entries(stats.userPerformance)
      .sort((a, b) => b[1].averageDuration - a[1].averageDuration)
      .slice(0, 10)
      .forEach(([userId, data]) => {
        const rating = this.getPerformanceRating(data.averageDuration);
        console.log(`  ${this.getPerformanceEmoji(rating)} ${userId}: ${data.averageDuration.toFixed(2)}ms avg (${data.count} commands)`);
      });

    console.log('\n💡 Recommendations:');
    if (stats.averageDuration > 1000) {
      console.log('  ⚠️  Average response time is slow. Consider:');
      console.log('     - Database optimization');
      console.log('     - Implementing caching');
      console.log('     - Reducing database queries');
    }
    
    if (stats.performanceBreakdown['VERY_SLOW'] > 0) {
      console.log('  🚨 Some commands are very slow. Investigate:');
      console.log('     - Database indexing');
      console.log('     - Memory usage');
      console.log('     - Network latency');
    }

    console.log('\n📁 Log file:', this.logFile);
  }

  clearLogs() {
    if (fs.existsSync(this.logFile)) {
      fs.unlinkSync(this.logFile);
      console.log('✅ Performance logs cleared');
    } else {
      console.log('❌ No performance logs to clear');
    }
  }
}

// CLI Interface
if (require.main === module) {
  const monitor = new PerformanceMonitor();
  const command = process.argv[2];

  switch (command) {
    case 'report':
      monitor.generateReport();
      break;
    case 'clear':
      monitor.clearLogs();
      break;
    case 'watch':
      console.log('👀 Watching performance logs... (Press Ctrl+C to stop)');
      console.log('📁 Log file:', monitor.logFile);
      
      // Watch log file for real-time updates
      const logWatcher = fs.watch(monitor.logFile, (eventType, filename) => {
        if (eventType === 'change') {
          const lastLine = fs.readFileSync(monitor.logFile, 'utf8').split('\n').slice(-2)[0];
          if (lastLine.trim()) {
            console.log(lastLine);
          }
        }
      });

      process.on('SIGINT', () => {
        logWatcher.close();
        console.log('\n👋 Performance monitoring stopped');
        process.exit(0);
      });
      break;
    default:
      console.log('📊 Performance Monitor for Cek Saldo Command');
      console.log('\nUsage:');
      console.log('  node performance-monitor.js report  - Generate performance report');
      console.log('  node performance-monitor.js clear   - Clear performance logs');
      console.log('  node performance-monitor.js watch   - Watch logs in real-time');
      console.log('\nExamples:');
      console.log('  node performance-monitor.js report');
      console.log('  node performance-monitor.js watch');
  }
}

module.exports = PerformanceMonitor; 