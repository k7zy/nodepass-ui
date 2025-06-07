import type { WriteStream } from 'fs';
import { number } from 'zod';
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

// 日志级别
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
} as const;

type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

class Logger {
  private logDir: string;
  private currentDate: string;
  private logStream: WriteStream | null;
  
  constructor() {
    // 在项目根目录下创建 logs 文件夹
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.currentDate = '';
    this.logStream = null;
    this.openLogFile();
  }
  
  private openLogFile() {
    const date = format(new Date(), 'yyyy-MM-dd');
    
    // 如果日期变化，关闭旧文件流
    if (this.currentDate !== date) {
      if (this.logStream) {
        this.logStream.end();
        this.logStream = null;
      }
      
      this.currentDate = date;
      const logFile = path.join(this.logDir, `sse-${date}.log`);
      this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    }
  }
  
  private formatMessage(level: LogLevelType, message: string, meta?: any): string {
    // const timestamp = format(, 'yyyy-MM-dd HH:mm:ss.SSS');
    let logMessage = `${new Date().toISOString()} ${level} ${message}`;
    
    if (meta) {
      if (meta instanceof Error) {
        logMessage += `\nError: ${meta.message}\nStack: ${meta.stack}`;
      } else if (typeof meta === 'string'){
        logMessage += `${meta}`
      } else if (typeof meta === 'number') {
        logMessage += `${meta}`;
      } else {
        logMessage += `\nMeta: ${JSON.stringify(meta, null, 2)}`;
      }
    }
    
    return logMessage;
  }
  
  private write(level: LogLevelType, message: string, meta?: any) {
    this.openLogFile();
    
    const logMessage = this.formatMessage(level, message, meta);
    
    // 写入文件
    if (this.logStream) {
      this.logStream.write(logMessage);
    }
    
    // 同时输出到控制台
    if (level === LogLevel.ERROR) {
      console.error(logMessage);
    } else {
      console.log(logMessage);
    }
  }
  
  public debug(message: string, meta?: any) {
    this.write(LogLevel.DEBUG, message, meta);
  }
  
  public info(message: string, meta?: any) {
    this.write(LogLevel.INFO, message, meta);
  }
  
  public warn(message: string, meta?: any) {
    this.write(LogLevel.WARN, message, meta);
  }
  
  public error(message: string, meta?: any) {
    this.write(LogLevel.ERROR, message, meta);
  }
  
  public close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// 创建单例
export const logger = new Logger(); 