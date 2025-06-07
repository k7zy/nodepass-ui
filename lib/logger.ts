/**
 * 日志级别枚举
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * 日志工具类
 */
class Logger {
  /**
   * 输出调试日志
   */
  debug(...args: any[]) {
    console.debug(`${new Date().toISOString()} DEBUG`, ...args);
  }

  /**
   * 输出信息日志
   */
  info(...args: any[]) {
    console.info(`${new Date().toISOString()} INFO`, ...args);
  }

  /**
   * 输出警告日志
   */
  warn(...args: any[]) {
    console.warn(`${new Date().toISOString()} WARN`, ...args);
  }

  /**
   * 输出错误日志
   */
  error(...args: any[]) {
    console.error(`${new Date().toISOString()} ERROR`, ...args);
  }
}

// 导出单例实例
export const logger = new Logger(); 