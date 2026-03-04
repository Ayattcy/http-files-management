/**
 * 操作管理模块
 * 处理用户交互、快捷键、文件操作等
 */

const FileOperations = {
    /**
     * 打开文件或文件夹
     */
    open(ids) {
        ids.forEach(id => {
            const item = AppState.items.find(i => i.id === id);
            if (!item) return;

            if (item.type === 'dir') {
                this.navigateToFolder(item.name);
            } else {
                FilePreview.open(id);
            }
        });
    },

    /**
     * 导航到文件夹
     */
    navigateToFolder(name) {
        const newPath = AppState.currentPath === '/' ?
            `/${name}` : `${AppState.currentPath}/${name}`;

        ConnectionManager.send({ cmd: 'ls', path: newPath });
        EventBus.emit('navigate-folder', newPath);
    },

    /**
     * 导航到指定路径
     */
    navigateToPath(path) {
        ConnectionManager.send({ cmd: 'ls', path });
        EventBus.emit('navigate', path);
    },

    /**
     * 返回首页
     */
    goHome() {
        ConnectionManager.send({ cmd: 'ls', path: '/' });
        EventBus.emit('navigate', '/');
    },

    /**
     * 重命名文件
     */
    async rename(id) {
        const item = AppState.items.find(i => i.id === id);
        if (!item) return;

        const newName = await Dialog.prompt('请输入新名称:', item.name, '重命名');
        if (newName) {
            OperationManager.start();
            ConnectionManager.send({ cmd: 'mv', id, name: newName });
        }
    },

    /**
     * 复制到剪贴板
     */
    copy(ids) {
        AppState.setClipboard('copy', ids);
        EventBus.emit('clipboard:copy', ids);
    },

    /**
     * 剪切到剪贴板
     */
    cut(ids) {
        AppState.setClipboard('cut', ids);
        EventBus.emit('clipboard:cut', ids);
    },

    /**
     * 粘贴
     */
    async paste() {
        const { action, items } = AppState.clipboard;
        if (!action || items.length === 0) return;

        OperationManager.start();
        try {
            await ConnectionManager.post('/paste', {
                action,
                items,
                target: AppState.currentPath
            });
            AppState.clearClipboard();
            OperationManager.requestSync(500);
        } catch (err) {
            ErrorHandler.error('Paste failed', err);
            OperationManager.end();
        }
    },

    /**
     * 删除文件
     */
    async delete(ids) {
        const confirmed = await Dialog.confirm(
            `确定要删除 ${ids.length} 项吗?`,
            '删除确认'
        );

        if (confirmed) {
            OperationManager.start();
            ConnectionManager.send({ cmd: 'rm', ids });
        }
    },

    /**
     * 下载文件
     */
    download(ids) {
        ids.forEach(id => {
            const item = AppState.items.find(i => i.id === id);
            if (item) {
                FilePreview.download(`/file/${id}`, item.name);
            }
        });
    },

    /**
     * 创建文件夹
     */
    async createFolder() {
        const name = await Dialog.prompt(
            '请输入文件夹名称:',
            '新建文件夹',
            '新建文件夹'
        );

        if (name) {
            OperationManager.start();
            ConnectionManager.send({
                cmd: 'mkdir',
                path: AppState.currentPath,
                name
            });
        }
    },

    /**
     * 刷新当前目录
     */
    refresh() {
        ConnectionManager.send({ cmd: 'ls', path: AppState.currentPath });
    }
};

/**
 * 菜单管理器
 */
const MenuManager = {
    fileMenu: null,
    blankMenu: null,
    currentRightClickIds: [],

    init() {
        this.fileMenu = DOMUtils.get('file_menu');
        this.blankMenu = DOMUtils.get('blank_menu');

        this.bindEvents();
    },

    bindEvents() {
        // 右键菜单事件
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e);
        });

        // 点击其他地方关闭菜单
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#file_menu') &&
                !e.target.closest('#blank_menu')) {
                this.hideAll();
            }
        });

        // 文件菜单点击
        this.fileMenu?.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu_item');
            if (menuItem) {
                this.handleAction(menuItem.dataset.action, this.currentRightClickIds);
                this.hideAll();
            }
        });

        // 空白菜单点击
        this.blankMenu?.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu_item');
            if (menuItem) {
                this.handleAction(menuItem.dataset.action, []);
                this.hideAll();
            }
        });
    },

    showContextMenu(e) {
        AppState.isContextMenuOpen = true;
        this.hideAll();

        const f = e.target.closest('.files');

        if (f) {
            this.currentRightClickIds = this.getRightClickSelectedIds(f);
            this.updateMenuItems(this.currentRightClickIds.length);
            DOMUtils.toggle(this.fileMenu, true);
            DOMUtils.adjustMenuPosition(this.fileMenu, e.pageX, e.pageY);
        } else {
            this.currentRightClickIds = [];
            this.updatePasteItem();
            DOMUtils.toggle(this.blankMenu, true);
            DOMUtils.adjustMenuPosition(this.blankMenu, e.pageX, e.pageY);
        }
    },

    getRightClickSelectedIds(targetFile) {
        const targetId = targetFile?.dataset?.id;
        if (!targetId) return [];

        if (AppState.selected.has(targetId)) {
            return Array.from(AppState.selected);
        }
        return [targetId];
    },

    updateMenuItems(count) {
        const renameItem = this.fileMenu?.querySelector('[data-action="rename"]');
        if (renameItem) {
            const disabled = count > 1;
            renameItem.style.color = disabled ? '#888' : '#353a4a';
            renameItem.style.pointerEvents = disabled ? 'none' : 'auto';
            renameItem.title = disabled ? '重命名只能对单个文件使用' : '';
        }
    },

    updatePasteItem() {
        const pasteItem = this.blankMenu?.querySelector('[data-action="paste"]');
        if (pasteItem) {
            const enabled = AppState.clipboard.action;
            pasteItem.style.color = enabled ? '#353a4a' : '#888';
            pasteItem.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    },

    handleAction(action, ids) {
        switch (action) {
            case 'open':
                FileOperations.open(ids);
                break;
            case 'rename':
                if (ids.length === 1) {
                    FileOperations.rename(ids[0]);
                } else if (ids.length > 1) {
                    Dialog.alert('重命名只能对单个文件或文件夹使用', '提示');
                }
                break;
            case 'copy':
                FileOperations.copy(ids);
                break;
            case 'cut':
                FileOperations.cut(ids);
                break;
            case 'paste':
                FileOperations.paste();
                break;
            case 'delete':
                FileOperations.delete(ids);
                break;
            case 'download':
                FileOperations.download(ids);
                break;
            case 'mkdir':
                FileOperations.createFolder();
                break;
            case 'upload':
                DOMUtils.get('upload_input')?.click();
                break;
            case 'refresh':
                FileOperations.refresh();
                break;
            case 'sort_name':
                FileSorter.setMode('name');
                EventBus.emit('render:request');
                break;
            case 'sort_size':
                FileSorter.setMode('size');
                EventBus.emit('render:request');
                break;
            case 'sort_time':
                FileSorter.setMode('time');
                EventBus.emit('render:request');
                break;
        }

        AppState.isContextMenuOpen = false;
    },

    hideAll() {
        DOMUtils.toggle(this.fileMenu, false);
        DOMUtils.toggle(this.blankMenu, false);
        AppState.isContextMenuOpen = false;
    }
};

/**
 * 快捷键管理器
 */
const ShortcutManager = {
    init() {
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
    },

    handleKeydown(e) {
        // 输入框中不处理快捷键
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // 右键菜单打开时，ESC关闭菜单
        if (AppState.isContextMenuOpen) {
            if (e.key === 'Escape') {
                MenuManager.hideAll();
                return;
            }
        }

        switch (e.key) {
            case 'F5':
            case 'r':
                if (e.ctrlKey) {
                    e.preventDefault();
                    FileOperations.refresh();
                }
                break;

            case 'a':
                if (e.ctrlKey) {
                    e.preventDefault();
                    AppState.items.forEach(i => AppState.select(i.id));
                    EventBus.emit('render:request');
                }
                break;

            case 'Delete':
                if (AppState.selected.size > 0) {
                    FileOperations.delete(Array.from(AppState.selected));
                }
                break;

            case 'c':
                if (e.ctrlKey) {
                    e.preventDefault();
                    FileOperations.copy(Array.from(AppState.selected));
                }
                break;

            case 'x':
                if (e.ctrlKey) {
                    e.preventDefault();
                    FileOperations.cut(Array.from(AppState.selected));
                }
                break;

            case 'v':
                if (e.ctrlKey) {
                    e.preventDefault();
                    FileOperations.paste();
                }
                break;

            case 'n':
                if (e.ctrlKey) {
                    e.preventDefault();
                    FileOperations.createFolder();
                }
                break;

            case 'F2':
                if (AppState.selected.size === 1) {
                    FileOperations.rename(Array.from(AppState.selected)[0]);
                } else if (AppState.selected.size > 1) {
                    Dialog.alert('重命名只能对单个文件或文件夹使用', '提示');
                }
                break;

            case 'Enter':
                if (AppState.selected.size > 0) {
                    FileOperations.open(Array.from(AppState.selected));
                }
                break;
        }
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FileOperations, MenuManager, ShortcutManager };
}
