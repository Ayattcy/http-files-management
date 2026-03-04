/**
 * 错误处理模块
 * 统一的错误处理和日志管理
 */

const ErrorHandler = {
    // 错误级别
    Levels: {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
        FATAL: 4
    },

    // 当前日志级别
    currentLevel: 1, // INFO

    /**
     * 记录日志
     */
    log(level, message, data = null) {
        if (level < this.currentLevel) return;

        const timestamp = new Date().toISOString();
        const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
        const levelName = levelNames[level] || 'UNKNOWN';

        const logEntry = {
            timestamp,
            level: levelName,
            message,
            data
        };

        // 控制台输出
        const consoleMethod = level >= 3 ? 'error' : level >= 2 ? 'warn' : 'log';
        console[consoleMethod](`[${levelName}] ${message}`, data || '');

        // 触发错误事件
        if (level >= 3 && typeof EventBus !== 'undefined') {
            EventBus.emit('error', logEntry);
        }

        return logEntry;
    },

    debug(msg, data) { return this.log(this.Levels.DEBUG, msg, data); },
    info(msg, data) { return this.log(this.Levels.INFO, msg, data); },
    warn(msg, data) { return this.log(this.Levels.WARN, msg, data); },
    error(msg, data) { return this.log(this.Levels.ERROR, msg, data); },
    fatal(msg, data) { return this.log(this.Levels.FATAL, msg, data); },

    /**
     * 处理异常
     */
    handleError(error, context = '') {
        this.error(`Error in ${context}: ${error.message}`, {
            stack: error.stack,
            context
        });

        // 可以在这里添加错误上报逻辑
        if (typeof EventBus !== 'undefined') {
            EventBus.emit('app:error', { error, context });
        }
    },

    /**
     * 包装异步函数，自动捕获错误
     */
    wrapAsync(fn, context = '') {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handleError(error, context);
                throw error;
            }
        };
    },

    /**
     * 安全执行函数
     */
    safeExecute(fn, defaultValue = null, context = '') {
        try {
            return fn();
        } catch (error) {
            this.handleError(error, context);
            return defaultValue;
        }
    }
};

// 全局错误捕获
window.addEventListener('error', (event) => {
    ErrorHandler.error('Global error caught', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack
    });
});

window.addEventListener('unhandledrejection', (event) => {
    ErrorHandler.error('Unhandled promise rejection', {
        reason: event.reason?.message || event.reason,
        stack: event.reason?.stack
    });
});

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ErrorHandler };
}
