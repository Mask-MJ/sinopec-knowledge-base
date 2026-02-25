import { utilities } from 'nest-winston';
import * as winston from 'winston';

import 'winston-daily-rotate-file';

/**
 * 日志级别配置（根据环境自动调整）
 */
const LOG_LEVEL = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

/**
 * 应用名称（用于控制台日志前缀）
 */
const APP_NAME = 'Sinopec KB';

/**
 * 需要过滤的 NestJS 框架日志 context
 */
const FILTERED_CONTEXTS = new Set([
  'InstanceLoader',
  'NestApplication',
  'NestFactory',
  'RouterExplorer',
  'RoutesResolver',
]);

/**
 * 框架日志过滤器
 */
const ignoreFrameworkLogs = winston.format((info) => {
  if (FILTERED_CONTEXTS.has(info.context as string)) {
    return false;
  }
  return info;
});

/**
 * 文件日志格式：JSON 结构化日志
 */
const fileFormat = winston.format.combine(
  ignoreFrameworkLogs(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.json(),
);

/**
 * 控制台日志格式：彩色可读格式
 */
const consoleFormat = winston.format.combine(
  ignoreFrameworkLogs(),
  winston.format.timestamp(),
  winston.format.ms(),
  utilities.format.nestLike(APP_NAME, { prettyPrint: true }),
);

/**
 * 创建文件日志 Transport
 */
export function createFileTransport(level: string, filename: string) {
  return new winston.transports.DailyRotateFile({
    level,
    dirname: 'logs',
    filename: `${filename}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '30d',
    format: fileFormat,
  });
}

/**
 * 创建控制台日志 Transport
 */
export function createConsoleTransport() {
  return new winston.transports.Console({
    level: LOG_LEVEL,
    format: consoleFormat,
  });
}

/**
 * 创建 Winston 日志配置
 * @param logOn 是否启用文件日志
 */
export function createLoggerConfig(logOn: boolean) {
  return {
    transports: [
      createConsoleTransport(),
      ...(logOn
        ? [
            createFileTransport('info', 'application'),
            createFileTransport('warn', 'error'),
          ]
        : []),
    ],
  };
}
