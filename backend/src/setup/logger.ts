type LogLevel = "debug" | "info" | "warn" | "error";

// ANSI color codes
const colors = {
  green: "\x1b[32m",
  reset: "\x1b[0m",
};

class Logger {
  private logLevel: LogLevel;

  constructor(level: LogLevel = "info") {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, data?: any, useColor?: string): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const colorCode = useColor || "";
    const resetCode = useColor ? colors.reset : "";
    
    if (data !== undefined) {
      return `${colorCode}${prefix} ${message} ${JSON.stringify(data, null, 2)}${resetCode}`;
    }
    return `${colorCode}${prefix} ${message}${resetCode}`;
  }

  debug(message: string, data?: any): void {
    if (this.shouldLog("debug")) {
      console.debug(this.formatMessage("debug", message, data));
    }
  }

  info(message: string, data?: any): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, data));
    }
  }

  success(message: string, data?: any): void {
    if (this.shouldLog("info")) {
      console.info(this.formatMessage("info", message, data, colors.green));
    }
  }

  warn(message: string, data?: any): void {
    if (this.shouldLog("warn")) {
      console.warn(this.formatMessage("warn", message, data));
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog("error")) {
      const errorData = error instanceof Error 
        ? { message: error.message, stack: error.stack }
        : error;
      console.error(this.formatMessage("error", message, errorData));
    }
  }
}

export const logger = new Logger(process.env.LOG_LEVEL as LogLevel || "info");
