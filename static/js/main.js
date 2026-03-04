/**
 * 主入口文件
 * 远程文件管理系统 - 模块化引擎架构
 */

// ============================================
// 模块加载顺序（通过 script 标签引入）
// ============================================
// 1. core/state.js      - 核心状态管理
// 2. modules/utils.js   - 工具函数
// 3. modules/error.js   - 错误处理
// 4. modules/connection.js - 服务器通信
// 5. modules/ui.js      - UI管理
// 6. modules/features.js - 功能管理（预览、排序等）
// 7. modules/upload.js  - 上传管理
// 8. modules/selection.js - 框选功能
// 9. modules/operations.js - 操作管理（菜单、快捷键等）
// 10. main.js (本文件)  - 应用初始化
// ============================================

/**
 * 应用主类
 * 负责初始化和协调各个模块
 */
class FileManagerApp {
    constructor() {
        this.modules = {};
        this.isInitialized = false;
    }

    /**
     * 初始化应用
     */
    init() {
        if (this.isInitialized) {
            ErrorHandler.warn('App already initialized');
            return;
        }

        ErrorHandler.info('Initializing File Manager App...');

        try {
            // 初始化各个模块
            this.initCore();
            this.initUI();
            this.initFeatures();
            this.initOperations();
            this.initConnection();
            this.initEventListeners();

            // 检查协议完整性状态
            this.checkLicenseStatus();

            this.isInitialized = true;
            ErrorHandler.info('File Manager App initialized successfully');

        } catch (err) {
            ErrorHandler.fatal('Failed to initialize app', err);
            throw err;
        }
    }

    /**
     * 初始化核心模块
     */
    initCore() {
        // 状态管理已在 core/state.js 中自动创建
        // 这里只需要确保 Dialog 初始化
        Dialog.init();
    }

    /**
     * 初始化 UI 模块
     */
    initUI() {
        UIManager.init();
        FilePreview.init();
    }

    /**
     * 初始化功能模块
     */
    initFeatures() {
        UploadManager.init();
        SelectionManager.init();
        FileClickHandler.init();
    }

    /**
     * 初始化操作模块
     */
    initOperations() {
        MenuManager.init();
        ShortcutManager.init();
    }

    /**
     * 初始化连接
     */
    initConnection() {
        // 延迟连接，确保所有模块已就绪
        setTimeout(() => {
            ConnectionManager.connect();
        }, 100);
    }

    /**
     * 初始化全局事件监听
     */
    initEventListeners() {
        // 连接事件
        EventBus.on('connection:failed', () => {
            Dialog.alert('连接失败，请刷新页面重试');
        });

        EventBus.on('server:error', (msg) => {
            Dialog.alert('Error: ' + msg.msg);
        });

        // 导航事件 - 播放音效（面包屑点击）
        EventBus.on('navigate', () => {
            this.playSound('back');
        });

        // 打开文件夹事件 - 播放音效
        EventBus.on('navigate-folder', () => {
            this.playSound('open');
        });

        // 剪贴板操作音效
        EventBus.on('clipboard:copy', () => {
            ErrorHandler.debug('Files copied to clipboard');
        });

        EventBus.on('clipboard:cut', () => {
            ErrorHandler.debug('Files cut to clipboard');
        });

        // 窗口大小变化
        window.addEventListener('resize', Utils.debounce(() => {
            BreadcrumbRenderer.render();
        }, 100));

        // 页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // 页面重新可见时刷新
                OperationManager.requestSync(500);
            }
        });
    }

    /**
     * 播放音效
     */
    playSound(type) {
        const sounds = {
            open: '/sounds/open_files.mp3',
            back: '/sounds/back.mp3'
        };

        const src = sounds[type];
        if (!src) return;

        const audio = new Audio(src);
        audio.play().catch(() => {
            // 忽略自动播放限制错误
        });
    }

    /**
     * 检查协议完整性状态
     */
    async checkLicenseStatus() {
        try {
            const response = await fetch('/api/status');
            if (response.ok) {
                const data = await response.json();
                if (!data.license_valid) {
                    console.log('license_check_failed');
                    ErrorHandler.warn('License check failed: 协议内容可能已被修改');
                }
            }
        } catch (err) {
            // 静默处理，不影响正常功能
            ErrorHandler.debug('Failed to check license status', err);
        }
    }
}

// ============================================
// 全局辅助函数（保持向后兼容）
// ============================================

/**
 * HTML 转义
 */
function esc(s) {
    return Utils.escapeHtml(s);
}

/**
 * 关闭预览窗口
 */
function closePreview() {
    FilePreview.close();
}

/**
 * 关闭上传列表
 */
function closeUploadList() {
    UploadManager.closeList();
}

/**
 * 返回首页
 */
function goHome() {
    FileOperations.goHome();
}

/**
 * 导航到指定路径
 */
function goPath(path) {
    FileOperations.navigateToPath(path);
}

// ============================================
// 应用启动
// ============================================

// 创建全局应用实例
const app = new FileManagerApp();

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// 导出全局对象（便于调试）
window.FileManager = {
    app,
    state: AppState,
    config: Config,
    eventBus: EventBus,
    utils: Utils,
    errorHandler: ErrorHandler,
    connection: ConnectionManager,
    ui: UIManager,
    operations: FileOperations,
    upload: UploadManager,
    preview: FilePreview
};

// 控制台提示
console.log('%c File Manager Engine ', 'background: linear-gradient(135deg, #6646e6 0%, #8b87e6 100%); color: white; padding: 4px 8px; border-radius: 4px;');
console.log('Version: 2.0.0 - Modular Engine Architecture');
console.log('Access global objects via window.FileManager');
