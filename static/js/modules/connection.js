/**
 * 服务器通信模块
 * 管理 WebSocket 连接和 HTTP 请求
 */

const ConnectionManager = {
    ws: null,
    retryCount: 0,
    isConnected: false,
    messageHandlers: new Map(),
    pendingRequests: new Map(),

    /**
     * 初始化 WebSocket 连接
     */
    connect() {
        const { WS_RETRY_MAX, WS_RETRY_BASE_DELAY } = Config;

        try {
            this.ws = new WebSocket(`ws://${location.host}/ws`);

            this.ws.onopen = () => {
                ErrorHandler.info('WebSocket connected');
                this.isConnected = true;
                this.retryCount = 0;
                OperationManager.startAutoSync();
                EventBus.emit('connection:open');

                // 发送初始列表请求
                this.send({ cmd: 'ls', path: '/' });
            };

            this.ws.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    this.handleMessage(msg);
                } catch (err) {
                    ErrorHandler.error('Failed to parse message', err);
                }
            };

            this.ws.onclose = () => {
                ErrorHandler.warn('WebSocket disconnected');
                this.isConnected = false;
                OperationManager.stopAutoSync();
                EventBus.emit('connection:close');

                if (this.retryCount < WS_RETRY_MAX) {
                    const delay = Math.min(
                        WS_RETRY_BASE_DELAY * Math.pow(2, this.retryCount),
                        60000
                    );
                    ErrorHandler.info(`Reconnecting in ${delay}ms...`);
                    setTimeout(() => {
                        this.retryCount++;
                        this.connect();
                    }, delay);
                } else {
                    ErrorHandler.error('Max retry attempts reached');
                    EventBus.emit('connection:failed');
                }
            };

            this.ws.onerror = (error) => {
                ErrorHandler.error('WebSocket error', error);
                EventBus.emit('connection:error', error);
            };

            AppState.setWebSocket(this.ws);

        } catch (err) {
            ErrorHandler.error('Failed to create WebSocket', err);
        }
    },

    /**
     * 发送消息
     */
    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            ErrorHandler.warn('WebSocket not ready, message dropped', data);
            return false;
        }

        try {
            this.ws.send(JSON.stringify(data));
            return true;
        } catch (err) {
            ErrorHandler.error('Failed to send message', err);
            return false;
        }
    },

    /**
     * 处理接收到的消息
     */
    handleMessage(msg) {
        const { type } = msg;

        switch (type) {
            case 'ls':
                this.handleListResponse(msg);
                break;
            case 'diff':
                this.handleDiff(msg);
                break;
            case 'error':
                ErrorHandler.error('Server error', msg.msg);
                EventBus.emit('server:error', msg);
                break;
            default:
                // 触发通用消息事件
                EventBus.emit(`msg:${type}`, msg);
        }

        // 调用注册的处理程序
        const handler = this.messageHandlers.get(type);
        if (handler) {
            handler(msg);
        }
    },

    /**
     * 处理列表响应
     */
    handleListResponse(msg) {
        const { items, path } = msg;
        const currentItems = AppState.items;

        // 检查是否真的变化了
        const hasChanged = !currentItems ||
                           currentItems.length !== items.length ||
                           AppState.currentPath !== path ||
                           JSON.stringify(currentItems.map(i => i.id).sort()) !==
                           JSON.stringify(items.map(i => i.id).sort());

        AppState.setItems(items);
        AppState.setPath(path);

        // 只移除已不存在的文件的选择状态
        const currentIds = new Set(items.map(i => i.id));
        for (const id of AppState.selected) {
            if (!currentIds.has(id)) {
                AppState.deselect(id);
            }
        }

        if (hasChanged) {
            EventBus.emit('files:changed', { items, path });
        }

        OperationManager.end();
    },

    /**
     * 处理差异更新
     */
    handleDiff(msg) {
        const { changes } = msg;
        let items = [...AppState.items];

        changes.forEach(change => {
            if (change.op === 'del') {
                items = items.filter(i => i.id !== change.id);
            } else if (change.op === 'mod') {
                const item = items.find(i => i.id === change.id);
                if (item) item.name = change.name;
            }
        });

        AppState.setItems(items);
        EventBus.emit('files:updated', items);
    },

    /**
     * 注册消息处理器
     */
    onMessage(type, handler) {
        this.messageHandlers.set(type, handler);
    },

    /**
     * 移除消息处理器
     */
    offMessage(type) {
        this.messageHandlers.delete(type);
    },

    /**
     * 发送 HTTP POST 请求
     */
    async post(url, data) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (err) {
            ErrorHandler.error(`POST ${url} failed`, err);
            throw err;
        }
    },

    /**
     * 上传文件
     */
    async upload(url, formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            if (onProgress) {
                xhr.upload.addEventListener('progress', onProgress);
            }

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch {
                        reject(new Error('Invalid response'));
                    }
                } else {
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Cancelled')));

            xhr.open('POST', url);
            xhr.send(formData);
        });
    },

    /**
     * 获取文件内容
     */
    async fetchFile(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load: ${response.status}`);
            }
            return await response.text();
        } catch (err) {
            ErrorHandler.error(`Fetch ${url} failed`, err);
            throw err;
        }
    }
};

/**
 * 操作状态管理器
 */
const OperationManager = {
    isOperating: false,
    pendingSync: false,
    syncDelay: 1000,
    syncTimer: null,
    autoSyncInterval: null,

    start() {
        this.isOperating = true;
        this.clearSyncTimer();
    },

    end() {
        this.isOperating = false;
        if (this.pendingSync) {
            this.pendingSync = false;
            this.sync();
        }
    },

    requestSync(delay = this.syncDelay) {
        if (this.isOperating) {
            this.pendingSync = true;
            return;
        }

        this.clearSyncTimer();
        this.syncTimer = setTimeout(() => this.sync(), delay);
    },

    sync() {
        this.pendingSync = false;
        ConnectionManager.send({ cmd: 'ls', path: AppState.currentPath });
    },

    clearSyncTimer() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
    },

    startAutoSync(interval = Config.SYNC_INTERVAL) {
        this.stopAutoSync();
        this.autoSyncInterval = setInterval(() => {
            if (!this.isOperating && !this.pendingSync) {
                this.sync();
            }
        }, interval);
    },

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConnectionManager, OperationManager };
}
