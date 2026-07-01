/**
 * logger.js — Winston logger stub for chatbot module.
 * 
 * If your main app already exports a logger, replace this with:
 *   module.exports = require('../../utils/logger');
 */

const { createLogger, format, transports } = require('winston');

const IST_OFFSET = 5.5 * 60 * 60 * 1000; // UTC+5:30

const istTimestamp = format((info) => {
  const d = new Date(Date.now() + IST_OFFSET);
  info.timestamp = d.toISOString().replace('T', ' ').slice(0, 19) + ' IST';
  return info;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    istTimestamp(),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) =>
      `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`
    )
  ),
  transports: [new transports.Console()],
});

module.exports = logger;
