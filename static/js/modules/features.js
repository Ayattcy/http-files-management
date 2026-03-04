/**
 * 功能管理模块
 * 文件预览、排序、剪贴板等功能
 */

const FilePreview = {
    modal: null,
    contentDiv: null,
    titleSpan: null,
    speedDisplay: null,

    init() {
        this.modal = DOMUtils.get('preview_modal');
        this.contentDiv = DOMUtils.get('preview_content');
        this.titleSpan = DOMUtils.get('preview_title');
        this.speedDisplay = DOMUtils.get('preview_buffer_speed');

        // 点击模态框外部关闭
        this.modal?.addEventListener('click', (e) => {
            if (e.target.id === 'preview_modal') {
                this.close();
            }
        });
    },

    /**
     * 打开文件预览
     */
    open(id) {
        const item = AppState.items.find(i => i.id === id);
        if (!item) return;

        const ext = Utils.getExtension(item.name);
        const fileType = Utils.getFileType(ext, Config.PREVIEW_TYPES);
        const url = `/file/${id}`;

        switch (fileType) {
            case 'image':
                this.showImage(url, item.name);
                break;
            case 'video':
                this.showVideo(url, item.name);
                break;
            case 'audio':
                this.showAudio(url, item.name);
                break;
            case 'pdf':
                window.open(url, '_blank');
                break;
            case 'text':
                this.showTextFile(url, item.name);
                break;
            default:
                this.download(url, item.name);
        }
    },

    /**
     * 显示图片预览
     */
    showImage(url, title) {
        this.titleSpan.textContent = title;
        this.clearSpeedDisplay();
        this.contentDiv.innerHTML = `<img src="${url}">`;
        DOMUtils.toggle(this.modal, true);
    },

    /**
     * 显示视频预览
     */
    showVideo(url, title) {
        this.titleSpan.textContent = title;
        this.contentDiv.innerHTML = `
            <div class="video-container">
                <div class="video-loading" style="display:none">正在加载...</div>
                <video src="${url}" controls preload="auto" playsinline autoplay></video>
            </div>
        `;

        DOMUtils.toggle(this.modal, true);

        // 视频事件处理
        setTimeout(() => {
            const video = this.contentDiv.querySelector('video');
            const loading = this.contentDiv.querySelector('.video-loading');

            if (video) {
                this.setupVideoEvents(video, loading);
            }
        }, 50);
    },

    /**
     * 设置视频事件
     */
    setupVideoEvents(video, loading) {
        let lastBuffered = 0;
        let lastTime = Date.now();
        let speedUpdateTimer = null;

        const updateBufferSpeed = () => {
            if (!video || !this.speedDisplay) return;

            if (video.buffered.length > 0 && video.duration) {
                const currentBuffered = video.buffered.end(video.buffered.length - 1);
                const bufferProgress = (currentBuffered / video.duration) * 100;

                if (bufferProgress >= 99.5) {
                    this.speedDisplay.textContent = '✓ 缓冲完成';
                    this.speedDisplay.style.cssText = `
                        color: #ffffff;
                        background: linear-gradient(135deg, #6646e6 0%, #8b87e6 100%);
                        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                    `;
                    return;
                }

                const currentTime = Date.now();
                const timeDiff = (currentTime - lastTime) / 1000;

                if (timeDiff > 0) {
                    const speed = (currentBuffered - lastBuffered) * 1024 * 1024 / 8 / timeDiff;

                    if (speed > 0) {
                        this.speedDisplay.textContent = '⚡ ' + Utils.formatSpeed(speed);
                        this.speedDisplay.style.cssText = `
                            color: #6646e6;
                            background: rgba(102, 70, 230, 0.1);
                        `;
                    }

                    lastBuffered = currentBuffered;
                    lastTime = currentTime;
                }
            }
        };

        video.play().catch(() => {
            if (loading) {
                loading.textContent = '▶ 点击播放';
                loading.style.display = 'block';
            }
        });

        video.addEventListener('waiting', () => {
            if (video.buffered.length > 0) {
                const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                if (bufferedEnd - video.currentTime < 5) {
                    loading.textContent = '缓冲中...';
                    loading.style.display = 'block';
                }
            }
        });

        video.addEventListener('playing', () => {
            loading.style.display = 'none';
        });

        video.addEventListener('progress', updateBufferSpeed);
        speedUpdateTimer = setInterval(updateBufferSpeed, 500);

        video.addEventListener('error', () => {
            loading.textContent = '加载失败';
            this.clearSpeedDisplay();
            clearInterval(speedUpdateTimer);
        });

        video.addEventListener('ended', () => {
            this.clearSpeedDisplay();
            clearInterval(speedUpdateTimer);
        });

        const cleanup = () => {
            if (speedUpdateTimer) {
                clearInterval(speedUpdateTimer);
                speedUpdateTimer = null;
            }
            this.clearSpeedDisplay();
        };

        video.addEventListener('pause', cleanup);
    },

    /**
     * 显示音频预览
     */
    showAudio(url, title) {
        this.titleSpan.textContent = title;
        this.clearSpeedDisplay();
        this.contentDiv.innerHTML = `<audio src="${url}" controls></audio>`;
        DOMUtils.toggle(this.modal, true);
    },

    /**
     * 显示文本文件
     */
    async showTextFile(url, title) {
        try {
            const text = await ConnectionManager.fetchFile(url);
            this.titleSpan.textContent = title;
            this.clearSpeedDisplay();
            this.contentDiv.innerHTML = '';

            const pre = DOMUtils.create('pre', { className: 'text-viewer' });
            pre.textContent = text;
            this.contentDiv.appendChild(pre);

            DOMUtils.toggle(this.modal, true);
        } catch (err) {
            ErrorHandler.error('Failed to load text file', err);
            Dialog.alert('加载文件失败: ' + err.message);
        }
    },

    /**
     * 下载文件
     */
    download(url, filename) {
        const a = DOMUtils.create('a', {
            href: url,
            download: filename
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    /**
     * 关闭预览
     */
    close() {
        const video = this.contentDiv?.querySelector('video');
        if (video) {
            video.pause();
            video.src = '';
            video.load();
        }

        this.clearSpeedDisplay();
        DOMUtils.toggle(this.modal, false);
        this.contentDiv.innerHTML = '';
    },

    /**
     * 清空速度显示
     */
    clearSpeedDisplay() {
        if (this.speedDisplay) {
            this.speedDisplay.textContent = '';
            this.speedDisplay.style.cssText = '';
        }
    }
};

/**
 * 文件排序器
 */
const FileSorter = {
    /**
     * 应用排序
     */
    apply() {
        const mode = AppState.sortMode;
        const items = [...AppState.items];

        switch (mode) {
            case 'name':
                this.sortByName(items);
                break;
            case 'size':
                this.sortBySize(items);
                break;
            case 'time':
                this.sortByTime(items);
                break;
        }

        AppState.setItems(items);
        return items;
    },

    sortByName(items) {
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name, 'zh-CN');
        });
    },

    sortBySize(items) {
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return b.size - a.size;
        });
    },

    sortByTime(items) {
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return b.mtime - a.mtime;
        });
    },

    /**
     * 设置排序模式
     */
    setMode(mode) {
        AppState.setSortMode(mode);
        this.apply();
        EventBus.emit('sort:changed', mode);
    }
};

/**
 * 文件搜索器
 */
const FileSearcher = {
    /**
     * 搜索文件
     */
    search(term) {
        if (!term) {
            return AppState.items;
        }

        const lowerTerm = term.toLowerCase();
        return AppState.items.filter(i =>
            i.name.toLowerCase().includes(lowerTerm)
        );
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FilePreview, FileSorter, FileSearcher };
}
