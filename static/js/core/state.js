/**
 * 核心状态管理模块
 * 管理应用全局状态和配置
 */

// 全局应用状态
const AppState = {
    currentPath: '/',
    items: [],
    selected: new Set(),
    clipboard: { action: null, items: [] },
    ws: null,
    sortMode: 'name',
    isContextMenuOpen: false,
    
    // 状态操作方法
    setPath(path) {
        this.currentPath = path;
    },
    
    setItems(items) {
        this.items = items;
    },
    
    select(id) {
        this.selected.add(id);
    },
    
    deselect(id) {
        this.selected.delete(id);
    },
    
    clearSelection() {
        this.selected.clear();
    },
    
    toggleSelection(id) {
        if (this.selected.has(id)) {
            this.selected.delete(id);
        } else {
            this.selected.add(id);
        }
    },
    
    setClipboard(action, items) {
        this.clipboard = { action, items };
    },
    
    clearClipboard() {
        this.clipboard = { action: null, items: [] };
    },
    
    setWebSocket(ws) {
        this.ws = ws;
    },
    
    setSortMode(mode) {
        this.sortMode = mode;
    }
};

// 配置常量
const Config = {
    WS_RETRY_MAX: 10,
    WS_RETRY_BASE_DELAY: 3000,
    SYNC_INTERVAL: 2000,
    SELECTION_THRESHOLD: 0.5, // 框选覆盖50%才选中
    FILE_ICONS: {
        txt: '文本文档', pdf: 'pdf',
        doc: 'word文字', docx: 'word文字',
        xls: '表格', xlsx: '表格',
        ppt: '幻灯片文件', pptx: '幻灯片文件',
        py: 'py文件', js: 'js', css: 'css',
        html: 'html', json: 'json', ini: 'ini',
        c: 'C类语言', cpp: 'C类语言', java: 'java类文件',
        jpg: '图片', jpeg: '图片', png: '图片', gif: '图片',
        mp4: '视频', avi: '视频', mkv: '视频',
        mp3: '音频', wav: '音频',
        exe: '可执行文件', msi: 'msi', dll: 'dll', bat: 'bat',
        apk: 'apk',
        zip: '压缩包', rar: '压缩包', '7z': '压缩包',
        log: '日志类', toml: 'toml',
    },
    PREVIEW_TYPES: {
        images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'],
        videos: ['mp4', 'avi', 'mkv', 'mov', 'webm'],
        audios: ['mp3', 'wav', 'flac', 'aac', 'ogg'],
        texts: ['txt', 'py', 'js', 'css', 'html', 'json', 'xml', 'ini', 'c', 'cpp', 'h', 'java', 'log', 'md', 'toml']
    }
};

// 事件总线 - 用于模块间通信
const EventBus = {
    listeners: {},
    
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    },
    
    off(event, callback) {
        if (!this.listeners[event]) return;
        const idx = this.listeners[event].indexOf(callback);
        if (idx > -1) {
            this.listeners[event].splice(idx, 1);
        }
    },
    
    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error('EventBus error:', e);
            }
        });
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppState, Config, EventBus };
}
