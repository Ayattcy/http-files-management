/**
 * 工具函数模块
 * 提供通用的辅助函数
 */

const Utils = {
    /**
     * HTML转义，防止XSS
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    /**
     * 格式化文件大小
     */
    formatSize(bytes) {
        if (bytes === 0) return '-';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return bytes.toFixed(1) + ' ' + units[i];
    },

    /**
     * 格式化速度
     */
    formatSpeed(bytesPerSecond) {
        if (bytesPerSecond >= 1024 * 1024) {
            return (bytesPerSecond / (1024 * 1024)).toFixed(2) + ' MB/s';
        } else if (bytesPerSecond >= 1024) {
            return (bytesPerSecond / 1024).toFixed(2) + ' KB/s';
        }
        return bytesPerSecond.toFixed(0) + ' B/s';
    },

    /**
     * 获取文件图标类型
     */
    getIcon(name, type, iconMap) {
        if (type === 'dir') return '文件夹';
        const ext = name.split('.').pop().toLowerCase();
        return iconMap[ext] || '其他文件';
    },

    /**
     * 节流函数
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * 防抖函数
     */
    debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    /**
     * 计算两个矩形的重叠面积
     */
    calculateOverlap(rect1, rect2) {
        const left = Math.max(rect1.left, rect2.left);
        const top = Math.max(rect1.top, rect2.top);
        const right = Math.min(rect1.right, rect2.right);
        const bottom = Math.min(rect1.bottom, rect2.bottom);

        if (left < right && top < bottom) {
            return (right - left) * (bottom - top);
        }
        return 0;
    },

    /**
     * 深拷贝对象
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    /**
     * 生成唯一ID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * 获取文件扩展名
     */
    getExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    },

    /**
     * 检查文件类型
     */
    getFileType(ext, previewTypes) {
        if (previewTypes.images.includes(ext)) return 'image';
        if (previewTypes.videos.includes(ext)) return 'video';
        if (previewTypes.audios.includes(ext)) return 'audio';
        if (previewTypes.texts.includes(ext)) return 'text';
        if (ext === 'pdf') return 'pdf';
        return 'other';
    }
};

// DOM 工具
const DOMUtils = {
    /**
     * 安全地获取元素
     */
    get(id) {
        return document.getElementById(id);
    },

    /**
     * 创建元素并设置属性
     */
    create(tag, attrs = {}, children = []) {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([dKey, dValue]) => {
                    el.dataset[dKey] = dValue;
                });
            } else if (key.startsWith('on')) {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        });
        children.forEach(child => {
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else {
                el.appendChild(child);
            }
        });
        return el;
    },

    /**
     * 调整菜单位置防止溢出
     */
    adjustMenuPosition(menu, x, y) {
        const menuWidth = menu.offsetWidth || 150;
        const menuHeight = menu.offsetHeight || 200;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let left = x;
        let top = y;

        if (left + menuWidth > windowWidth) {
            left = windowWidth - menuWidth - 10;
        }
        if (top + menuHeight > windowHeight) {
            top = windowHeight - menuHeight - 10;
        }

        left = Math.max(5, left);
        top = Math.max(5, top);

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    },

    /**
     * 显示/隐藏元素
     */
    toggle(el, show) {
        if (typeof el === 'string') {
            el = document.getElementById(el);
        }
        if (el) {
            el.style.display = show ? 'block' : 'none';
        }
    },

    /**
     * 添加/移除类名
     */
    toggleClass(el, className, force) {
        if (typeof el === 'string') {
            el = document.getElementById(el);
        }
        if (!el) return;
        
        if (force === undefined) {
            el.classList.toggle(className);
        } else if (force) {
            el.classList.add(className);
        } else {
            el.classList.remove(className);
        }
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Utils, DOMUtils };
}
