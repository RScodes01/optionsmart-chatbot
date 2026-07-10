/**
 * logger.js — Winston logger for the OptionSmart chatbot server.
 * Writes to console AND to logs/server.log for persistent inspection.
 */

const path = require('path');
const { createLogger, format, transports } = require('winston');

const IST_OFFSET = 5.5 * 60 * 60 * 1000; // UTC+5:30

const istTimestamp = format((info) => {
  const d = new Date(Date.now() + IST_OFFSET);
  info.timestamp = d.toISOString().replace('T', ' ').slice(0, 19) + ' IST';
  return info;
});

const logFormat = format.combine(
  istTimestamp(),
  format.errors({ stack: true }),
  format.printf(({ timestamp, level, message, stack }) =>
    `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`
  )
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new transports.Console(),
    new transports.File({
      filename: path.join(__dirname, '../logs/server.log'),
      maxsize: 2 * 1024 * 1024, // 2 MB max per file
      maxFiles: 3,              // keep 3 rotated files
      tailable: true,
    }),
  ],
});

module.exports = logger;
