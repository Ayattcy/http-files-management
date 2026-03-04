/**
 * 框选功能模块
 * 类似 Win7 的左键拖动框选
 */

const SelectionManager = {
    selectionBox: null,
    body: null,
    isDragging: false,
    startX: 0,
    startY: 0,
    startSelected: new Set(),
    threshold: 0.5, // 覆盖超过50%才被认为选中

    init() {
        this.selectionBox = DOMUtils.get('selection_box');
        this.body = DOMUtils.get('body');

        if (!this.selectionBox || !this.body) return;

        this.bindEvents();
    },

    bindEvents() {
        this.body.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
    },

    onMouseDown(e) {
        // 只响应左键
        if (e.button !== 0) return;

        // 如果点击的是文件项，不启动框选
        if (e.target.closest('.files')) return;

        // 如果点击的是右键菜单或对话框，不启动框选
        if (e.target.closest('#file_menu') ||
            e.target.closest('#blank_menu') ||
            e.target.closest('#custom_dialog_overlay') ||
            e.target.closest('#preview_modal')) return;

        e.preventDefault();

        this.isDragging = true;
        this.startX = e.clientX;
        this.startY = e.clientY;

        // 记录框选开始时的选中状态
        this.startSelected = new Set(AppState.selected);

        // 显示框选框
        this.selectionBox.style.display = 'block';
        this.selectionBox.style.left = this.startX + 'px';
        this.selectionBox.style.top = this.startY + 'px';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';

        // 如果没有按住 Ctrl，清空当前选择
        if (!e.ctrlKey && !e.metaKey) {
            AppState.clearSelection();
            UIManager.updateSelectionVisual();
        }
    },

    onMouseMove(e) {
        if (!this.isDragging) return;

        const currentX = e.clientX;
        const currentY = e.clientY;

        // 计算框选框的位置和大小
        const left = Math.min(this.startX, currentX);
        const top = Math.min(this.startY, currentY);
        const width = Math.abs(currentX - this.startX);
        const height = Math.abs(currentY - this.startY);

        this.selectionBox.style.left = left + 'px';
        this.selectionBox.style.top = top + 'px';
        this.selectionBox.style.width = width + 'px';
        this.selectionBox.style.height = height + 'px';

        // 实时更新选中状态
        this.updateSelection(left, top, width, height, e.ctrlKey || e.metaKey);
    },

    onMouseUp(e) {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.selectionBox.style.display = 'none';
        this.selectionBox.style.width = '0px';
        this.selectionBox.style.height = '0px';
    },

    updateSelection(boxLeft, boxTop, boxWidth, boxHeight, isCtrlKey) {
        const boxRect = {
            left: boxLeft,
            top: boxTop,
            right: boxLeft + boxWidth,
            bottom: boxTop + boxHeight
        };

        const fileItems = this.body.querySelectorAll('.files');

        fileItems.forEach(item => {
            const itemRect = item.getBoundingClientRect();
            const id = item.dataset.id;

            const overlapArea = Utils.calculateOverlap(itemRect, boxRect);
            const itemArea = itemRect.width * itemRect.height;

            const isSelected = overlapArea / itemArea > this.threshold;

            if (isCtrlKey) {
                // Ctrl+框选：切换选中状态
                if (isSelected) {
                    if (this.startSelected.has(id)) {
                        AppState.deselect(id);
                    } else {
                        AppState.select(id);
                    }
                } else {
                    // 恢复到初始状态
                    if (this.startSelected.has(id)) {
                        AppState.select(id);
                    } else {
                        AppState.deselect(id);
                    }
                }
            } else {
                // 普通框选：直接设置选中状态
                if (isSelected) {
                    AppState.select(id);
                } else {
                    AppState.deselect(id);
                }
            }
        });

        UIManager.updateSelectionVisual();
    }
};

/**
 * 文件点击处理器
 * 处理单击、双击、多选等交互
 */
const FileClickHandler = {
    clickState: {
        lastTime: 0,
        lastId: null,
        isProcessing: false,
        clickCount: 0,
        clickTimer: null
    },

    init() {
        this.bindEvents();
    },

    bindEvents() {
        const body = DOMUtils.get('body');
        if (!body) return;

        body.addEventListener('mousedown', (e) => this.onMouseDown(e));
        body.addEventListener('dblclick', (e) => e.preventDefault());
    },

    onMouseDown(e) {
        // 忽略右键
        if (e.button === 2) return;

        if (e.target.closest('#file_menu') ||
            e.target.closest('#blank_menu') ||
            e.target.closest('#custom_dialog_overlay')) {
            return;
        }

        const f = e.target.closest('.files');

        if (!f) {
            // 空白区域点击
            if (!e.ctrlKey && !e.metaKey && AppState.selected.size > 0) {
                setTimeout(() => {
                    if (!SelectionManager.isDragging) {
                        AppState.clearSelection();
                        UIManager.updateSelectionVisual();
                    }
                }, 50);
            }
            return;
        }

        const id = f.dataset.id;
        const now = Date.now();
        const state = this.clickState;

        if (state.isProcessing) return;

        const isDoubleClick = (now - state.lastTime < 300) && state.lastId === id;

        state.lastTime = now;
        state.lastId = id;
        state.clickCount++;

        if (state.clickTimer) {
            clearTimeout(state.clickTimer);
            state.clickTimer = null;
        }

        if (isDoubleClick) {
            state.isProcessing = true;
            state.clickCount = 0;
            this.handleDoubleClick(f);
            setTimeout(() => { state.isProcessing = false; }, 500);
        } else {
            state.clickTimer = setTimeout(() => {
                if (state.clickCount === 1) {
                    this.handleSingleClick(f, e);
                }
                state.clickCount = 0;
            }, 300);
        }
    },

    handleSingleClick(fileEl, e) {
        const id = fileEl.dataset.id;

        // Ctrl/Cmd + 点击 = 多选
        if (e.ctrlKey || e.metaKey) {
            AppState.toggleSelection(id);
            UIManager.updateSelectionVisual();
            return;
        }

        // 普通单选
        if (AppState.selected.has(id) && AppState.selected.size > 1) {
            return;
        }

        AppState.clearSelection();
        AppState.select(id);
        UIManager.updateSelectionVisual();
    },

    handleDoubleClick(fileEl) {
        const { type, name } = fileEl.dataset;

        if (type === 'dir') {
            FileOperations.navigateToFolder(name);
        } else {
            FilePreview.open(fileEl.dataset.id);
        }
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SelectionManager, FileClickHandler };
}
