/**
 * 上传管理模块
 * 文件上传队列和进度管理
 */

const UploadManager = {
    queue: [],
    currentIndex: 0,
    currentXhr: null,
    isCancelled: false,
    startTime: 0,
    loadedBytes: 0,
    totalBytes: 0,
    lastSoundTime: 0,
    soundCooldown: 500,
    autoCloseTimer: null,
    uploadedSound: null,

    elements: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        this.uploadedSound = new Audio('/sounds/uploaded.mp3');
    },

    cacheElements() {
        this.elements = {
            input: DOMUtils.get('upload_input'),
            panel: DOMUtils.get('upload_panel'),
            currentFile: DOMUtils.get('upload_current_file'),
            count: DOMUtils.get('upload_queue_count'),
            speed: DOMUtils.get('upload_speed_text'),
            percent: DOMUtils.get('upload_percent_text'),
            progress: DOMUtils.get('upload_progress'),
            cancelBtn: DOMUtils.get('upload_cancel'),
            listModal: DOMUtils.get('upload_list_modal'),
            listBody: DOMUtils.get('upload_list_body'),
            body: DOMUtils.get('body')
        };
    },

    bindEvents() {
        // 文件输入
        this.elements.input?.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length) {
                this.addFiles(files);
                e.target.value = '';
            }
        });

        // 取消按钮
        this.elements.cancelBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.cancelAll();
        });

        // 面板点击打开列表
        this.elements.panel?.addEventListener('click', (e) => {
            if (e.target.id !== 'upload_cancel') {
                this.openList();
            }
        });

        // 列表模态框点击关闭
        this.elements.listModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.listModal) {
                this.closeList();
            }
        });

        // 拖放上传
        this.setupDragDrop();
    },

    setupDragDrop() {
        const body = this.elements.body;
        if (!body) return;

        body.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            body.style.backgroundColor = '#a4a1ff';
        });

        body.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            body.style.backgroundColor = '#bfc8ff';
        });

        body.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            body.style.backgroundColor = '#bfc8ff';

            const files = Array.from(e.dataTransfer.files);
            if (files.length) {
                this.addFiles(files);
            }
        });
    },

    playUploadedSound() {
        const now = Date.now();
        if (now - this.lastSoundTime >= this.soundCooldown) {
            this.uploadedSound.currentTime = 0;
            this.uploadedSound.play().catch(() => {});
            this.lastSoundTime = now;
        }
    },

    reset() {
        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }

        this.elements.panel?.classList.remove('hiding', 'cancelled');
        this.queue = [];
        this.currentIndex = 0;
        this.currentXhr = null;
        this.isCancelled = false;
        this.startTime = 0;
        this.loadedBytes = 0;
        this.totalBytes = 0;
    },

    async addFiles(files) {
        if (!files?.length) return;

        const isFirstBatch = this.queue.length === 0;

        files.forEach(file => {
            this.queue.push({
                file,
                loaded: 0,
                total: file.size,
                error: false,
                cancelled: false
            });
            this.totalBytes += file.size;
        });

        this.updatePanel();

        if (isFirstBatch) {
            this.startTime = Date.now();
            await this.processQueue();
        }
    },

    async processQueue() {
        while (this.currentIndex < this.queue.length && !this.isCancelled) {
            const item = this.queue[this.currentIndex];

            if (item.cancelled) {
                this.currentIndex++;
                continue;
            }

            this.updatePanel();

            try {
                await this.uploadSingle(item);
                if (!item.error && !item.cancelled) {
                    item.loaded = item.total;
                }
                this.currentIndex++;
            } catch (err) {
                if (!this.isCancelled && !item.cancelled) {
                    item.error = true;
                    ErrorHandler.error('Upload error', err);
                }
                if (item.cancelled) {
                    this.currentIndex++;
                    continue;
                }
                break;
            }
        }

        this.updatePanel();

        if (!this.isCancelled && this.currentIndex >= this.queue.length) {
            OperationManager.requestSync(500);
            setTimeout(() => {
                this.reset();
                this.updatePanel();
            }, 2000);
        }
    },

    uploadSingle(item) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            this.currentXhr = xhr;

            const formData = new FormData();
            formData.append('file', item.file);

            const bytesBeforeThisFile = this.loadedBytes;

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && !this.isCancelled) {
                    item.loaded = e.loaded;
                    this.loadedBytes = bytesBeforeThisFile + e.loaded;
                    this.updatePanel();
                }
            });

            xhr.addEventListener('load', () => {
                this.currentXhr = null;
                if (xhr.status === 200) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        if (response.ok) {
                            this.playUploadedSound();
                            resolve();
                        } else {
                            item.error = true;
                            reject(new Error(response.error || 'Upload failed'));
                        }
                    } catch {
                        item.error = true;
                        reject(new Error('Invalid response'));
                    }
                } else {
                    item.error = true;
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                this.currentXhr = null;
                item.error = true;
                reject(new Error('Network error'));
            });

            xhr.addEventListener('abort', () => {
                this.currentXhr = null;
                item.cancelled = true;
                reject(new Error('Cancelled'));
            });

            const path = encodeURIComponent(AppState.currentPath);
            xhr.open('POST', `/upload?path=${path}`);
            xhr.send(formData);
        });
    },

    updatePanel() {
        const els = this.elements;
        if (!els.panel) return;

        if (this.queue.length === 0) {
            els.panel.style.display = 'none';
            return;
        }

        els.panel.style.display = 'block';

        const allDone = this.queue.every(item =>
            item.loaded >= item.total || item.error || item.cancelled
        );

        if (allDone) {
            els.currentFile.textContent = '全部完成';
            els.count.textContent = `${this.queue.length}/${this.queue.length}`;
        } else {
            const pendingIndex = this.queue.findIndex(item =>
                item.loaded < item.total && !item.error && !item.cancelled
            );
            const currentIdx = pendingIndex >= 0 ? pendingIndex : this.currentIndex;
            const current = this.queue[currentIdx];

            els.currentFile.textContent = current ? current.file.name : '准备上传...';
            els.count.textContent = `${currentIdx + 1}/${this.queue.length}`;
        }

        const totalProgress = this.totalBytes > 0 ?
            Math.round((this.loadedBytes / this.totalBytes) * 100) : 0;

        if (els.progress) els.progress.style.width = totalProgress + '%';
        if (els.percent) els.percent.textContent = totalProgress + '%';

        const elapsed = (Date.now() - this.startTime) / 1000;
        const speedValue = elapsed > 0 ? this.loadedBytes / elapsed : 0;
        if (els.speed) els.speed.textContent = Utils.formatSpeed(speedValue);

        this.updateList();
    },

    updateList() {
        const listBody = this.elements.listBody;
        if (!listBody) return;

        const allDone = this.queue.length > 0 && this.queue.every(item =>
            item.loaded >= item.total || item.error || item.cancelled
        );

        if (allDone && !this.autoCloseTimer) {
            this.autoCloseTimer = setTimeout(() => {
                this.elements.panel?.classList.add('hiding');
                setTimeout(() => {
                    this.closeList();
                    this.reset();
                    if (this.elements.panel) {
                        this.elements.panel.classList.remove('hiding');
                        this.elements.panel.style.display = 'none';
                    }
                }, 400);
            }, 2000);
        }

        const existingItems = Array.from(listBody.querySelectorAll('.upload_list_item'));

        this.queue.forEach((item, index) => {
            const { statusClass, statusText, progressStyle } = this.getItemStatus(item, index);
            const existingItem = existingItems[index];

            if (existingItem) {
                this.updateExistingItem(existingItem, statusClass, statusText, progressStyle, item, index);
            } else {
                this.createNewItem(listBody, item, index, statusClass, statusText, progressStyle);
            }
        });

        while (existingItems.length > this.queue.length) {
            existingItems.pop()?.remove();
        }

        listBody.onmousedown = (e) => {
            const btn = e.target.closest('.item_cancel');
            if (btn) {
                e.stopPropagation();
                e.preventDefault();
                this.cancelItem(parseInt(btn.dataset.index));
                return false;
            }
        };
    },

    getItemStatus(item, index) {
        let statusClass = 'pending';
        let statusText = '等待中';
        let progressStyle = '';

        if (item.cancelled) {
            statusClass = 'cancelled';
            statusText = '已取消';
        } else if (item.error) {
            statusClass = 'error';
            statusText = '失败';
        } else if (item.loaded >= item.total) {
            statusClass = 'done';
            statusText = '完成';
        } else if (index === this.currentIndex && this.currentXhr) {
            statusClass = 'uploading';
            const percent = item.total > 0 ?
                Math.round((item.loaded / item.total) * 100) : 0;
            statusText = `${percent}%`;
            progressStyle = `${percent}%`;
        }

        return { statusClass, statusText, progressStyle };
    },

    updateExistingItem(existingItem, statusClass, statusText, progressStyle, item, index) {
        existingItem.className = `upload_list_item ${statusClass}`;
        if (progressStyle) {
            existingItem.style.setProperty('--progress', progressStyle);
        }

        const statusEl = existingItem.querySelector('.file_status');
        if (statusEl && statusEl.textContent !== statusText) {
            statusEl.textContent = statusText;
        }

        const canCancel = index >= this.currentIndex &&
            !item.error && !item.cancelled && item.loaded < item.total;
        const cancelBtn = existingItem.querySelector('.item_cancel');
        const placeholder = existingItem.querySelector('.cancel-placeholder');

        if (canCancel && !cancelBtn) {
            const btn = DOMUtils.create('button', {
                type: 'button',
                className: 'item_cancel',
                dataset: { index },
                title: '取消上传'
            }, ['×']);
            if (placeholder) {
                placeholder.replaceWith(btn);
            } else {
                existingItem.insertBefore(btn, existingItem.firstChild);
            }
        } else if (!canCancel && cancelBtn) {
            const span = DOMUtils.create('span', {
                className: 'cancel-placeholder',
                style: 'width: 22px; margin-right: 10px; flex-shrink: 0;'
            });
            cancelBtn.replaceWith(span);
        }
    },

    createNewItem(listBody, item, index, statusClass, statusText, progressStyle) {
        const canCancel = index >= this.currentIndex &&
            !item.error && !item.cancelled && item.loaded < item.total;

        let cancelBtn = '';
        if (canCancel) {
            cancelBtn = `<button type="button" class="item_cancel" data-index="${index}" title="取消上传">×</button>`;
        } else {
            cancelBtn = `<span class="cancel-placeholder" style="width: 22px; margin-right: 10px; flex-shrink: 0;"></span>`;
        }

        let displayName = item.file.name;
        if (displayName.length > 25) {
            displayName = displayName.substring(0, 12) + '...' +
                displayName.substring(displayName.length - 10);
        }

        const div = DOMUtils.create('div', {
            className: `upload_list_item ${statusClass} new`,
            dataset: { index }
        });

        if (progressStyle) {
            div.style.setProperty('--progress', progressStyle);
        }

        div.innerHTML = `
            ${cancelBtn}
            <span class="file_name" title="${item.file.name}">${displayName}</span>
            <span class="file_size">${Utils.formatSize(item.file.size)}</span>
            <span class="file_status">${statusText}</span>
        `;

        listBody.appendChild(div);
        setTimeout(() => div.classList.remove('new'), 300);
    },

    cancelItem(index) {
        const item = this.queue[index];
        if (!item || item.cancelled || item.loaded >= item.total) return;

        item.cancelled = true;
        item.loaded = 0;

        if (index === this.currentIndex && this.currentXhr) {
            this.currentXhr.abort();
        } else if (index > this.currentIndex) {
            this.totalBytes -= item.total;
        }

        this.updatePanel();
    },

    cancelAll() {
        this.isCancelled = true;
        this.currentXhr?.abort();

        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }

        for (let i = this.currentIndex; i < this.queue.length; i++) {
            this.queue[i].cancelled = true;
        }

        this.updateList();
        this.elements.panel?.classList.add('cancelled');

        setTimeout(() => {
            this.closeList();
            this.reset();
            if (this.elements.panel) {
                this.elements.panel.classList.remove('cancelled');
                this.elements.panel.style.display = 'none';
            }
            OperationManager.requestSync(500);
        }, 800);
    },

    openList() {
        if (this.elements.listModal) {
            this.elements.listModal.style.display = 'flex';
            this.elements.listModal.classList.add('active');
        }
        this.updateList();
    },

    closeList() {
        if (this.elements.listModal) {
            this.elements.listModal.classList.remove('active');
            this.elements.listModal.style.display = 'none';
        }

        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UploadManager };
}
