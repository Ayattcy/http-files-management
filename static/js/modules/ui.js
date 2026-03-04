/**
 * UI 管理模块
 * 页面渲染、对话框、面包屑导航等
 */

const UIManager = {
    elements: {},

    init() {
        this.cacheElements();
        this.bindEvents();
    },

    cacheElements() {
        this.elements = {
            body: DOMUtils.get('body'),
            navBody: DOMUtils.get('nav_body'),
            searchInput: DOMUtils.get('ser_in'),
            refreshBtn: DOMUtils.get('refresh_btn'),
            empty: null // 动态创建
        };
    },

    bindEvents() {
        // 刷新按钮
        this.elements.refreshBtn?.addEventListener('click', () => {
            FileOperations.refresh();
        });

        // 搜索输入
        this.elements.searchInput?.addEventListener('input', (e) => {
            const term = e.target.value;
            const filtered = FileSearcher.search(term);
            this.renderFileList(filtered, !term);
        });

        // 窗口大小变化
        window.addEventListener('resize', Utils.debounce(() => {
            BreadcrumbRenderer.render();
        }, 100));

        // 监听文件变化事件
        EventBus.on('files:changed', () => {
            FileSorter.apply();
            this.renderFileList(AppState.items, true);
            BreadcrumbRenderer.render();
        });

        EventBus.on('files:updated', (items) => {
            this.renderFileList(items, true);
        });

        EventBus.on('render:request', () => {
            this.renderFileList(AppState.items, true);
        });

        EventBus.on('sort:changed', () => {
            this.renderFileList(AppState.items, true);
        });
    },

    /**
     * 渲染文件列表
     */
    renderFileList(items, showEmpty = true) {
        const container = this.elements.body;
        if (!container) return;

        if (items.length === 0) {
            if (showEmpty) {
                container.innerHTML = '<div id="empty">此文件夹为空</div>';
            }
            return;
        }

        container.innerHTML = items.map(item => this.createFileItem(item)).join('');
    },

    /**
     * 创建文件项 HTML
     */
    createFileItem(item) {
        const icon = Utils.getIcon(item.name, item.type, Config.FILE_ICONS);
        const isSelected = AppState.selected.has(item.id);
        const sizeText = item.type === 'dir' ? '' :
            `<span style="color:#666;font-size:12px;">${Utils.formatSize(item.size)}</span>`;

        return `
            <div class="files ${isSelected ? 'selected' : ''}"
                 data-id="${item.id}"
                 data-type="${item.type}"
                 data-name="${Utils.escapeHtml(item.name)}">
                <img src="img/${icon}.png" class="file_icon" draggable="false"
                     onerror="this.src='img/其他文件.png'"/>
                <span class="file_name">${Utils.escapeHtml(item.name)}<br>${sizeText}</span>
            </div>
        `;
    },

    /**
     * 更新文件选中状态显示
     */
    updateSelectionVisual() {
        const fileItems = this.elements.body?.querySelectorAll('.files');
        fileItems?.forEach(item => {
            const id = item.dataset.id;
            DOMUtils.toggleClass(item, 'selected', AppState.selected.has(id));
        });
    }
};

/**
 * 面包屑渲染器
 */
const BreadcrumbRenderer = {
    collapsedItems: [],

    async render() {
        const parts = AppState.currentPath.split('/').filter(Boolean);
        const items = this.buildItems(parts);

        if (items.length <= 2) {
            this.renderItems(items, 0);
            return;
        }

        // 先尝试全部显示，然后异步检测是否溢出
        this.renderItems(items, 0);

        // 等待浏览器完成布局计算
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (this.checkOverflow()) {
            // 需要折叠，使用二分查找找到合适的折叠数量
            let left = 1;
            let right = items.length - 2;
            let bestCollapseCount = items.length - 1;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                this.renderItems(items, mid);

                // 等待布局更新
                await new Promise(resolve => requestAnimationFrame(resolve));
                const hasOverflow = this.checkOverflow();

                if (hasOverflow) {
                    // 仍然溢出，需要折叠更多
                    left = mid + 1;
                } else {
                    // 没有溢出，记录当前折叠数，尝试折叠更少
                    bestCollapseCount = mid;
                    right = mid - 1;
                }
            }

            // 使用最佳的折叠数量重新渲染
            if (bestCollapseCount < items.length - 1) {
                this.renderItems(items, bestCollapseCount);
            }
        }
    },

    buildItems(parts) {
        const items = [{
            name: 'home',
            path: '/',
            isRoot: true,
            isLast: parts.length === 0
        }];

        let build = '';
        parts.forEach((p, i) => {
            build += '/' + p;
            items.push({
                name: p,
                path: build,
                isLast: i === parts.length - 1
            });
        });

        return items;
    },

    renderItems(items, collapseCount) {
        const nav = UIManager.elements.navBody;
        if (!nav) return;

        this.collapsedItems = items.slice(0, collapseCount);
        const visibleItems = items.slice(collapseCount);

        let html = '';

        // 折叠菜单按钮
        if (this.collapsedItems.length > 0) {
            html += `<div class="not_onit breadcrumb_more" onclick="BreadcrumbRenderer.showMenu(event)">...</div>`;
            html += `<span class="point_icon"><img src="img/右-箭头.png" class="point_icon"/></span>`;
        }

        // 可见项
        visibleItems.forEach((item, index) => {
            if (index > 0) {
                html += `<span class="point_icon"><img src="img/右-箭头.png" class="point_icon"/></span>`;
            }
            const cls = item.isLast ? 'onit' : 'not_onit';
            const onclick = item.isRoot ?
                'onclick="FileOperations.goHome()"' :
                `onclick="FileOperations.navigateToPath('${item.path}')"`;
            html += `<div class="${cls}" ${onclick}>${item.isRoot ? 'home' : Utils.escapeHtml(item.name)}</div>`;
        });

        nav.innerHTML = html;
    },

    checkOverflow() {
        const nav = UIManager.elements.navBody;
        if (!nav) return false;

        // 检测导航内容的实际宽度是否超过容器宽度
        const containerWidth = nav.clientWidth;
        const scrollWidth = nav.scrollWidth;

        // 如果内容宽度超过容器宽度，说明溢出了
        return scrollWidth > containerWidth + 5; // 5px 容差
    },

    showMenu(event) {
        event.stopPropagation();
        const menu = DOMUtils.get('breadcrumb_menu');
        if (!menu) return;

        let html = '';
        this.collapsedItems.forEach(item => {
            const arrowIcon = `<img src="img/右-箭头.png" style="width:12px;height:12px;margin-right:8px;vertical-align:middle;opacity:0.7;"/>`;
            const onclick = item.isRoot ?
                'onclick="BreadcrumbRenderer.goHome()"' :
                `onclick="BreadcrumbRenderer.goTo('${item.path}')"`;
            html += `<div class="menu_item" ${onclick}>${arrowIcon}${item.isRoot ? 'home' : Utils.escapeHtml(item.name)}</div>`;
        });

        menu.innerHTML = html;
        menu.style.display = 'block';

        const rect = event.target.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 5) + 'px';

        const closeMenu = (e) => {
            if (!e.target.closest('#breadcrumb_menu')) {
                menu.style.display = 'none';
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    },

    goTo(path) {
        DOMUtils.toggle('breadcrumb_menu', false);
        FileOperations.navigateToPath(path);
    },

    goHome() {
        DOMUtils.toggle('breadcrumb_menu', false);
        FileOperations.goHome();
    }
};

/**
 * 对话框管理器
 */
const Dialog = {
    overlay: null,
    dialog: null,
    titleEl: null,
    messageEl: null,
    inputWrapper: null,
    input: null,
    cancelBtn: null,
    okBtn: null,
    resolve: null,
    reject: null,

    init() {
        this.overlay = DOMUtils.get('custom_dialog_overlay');
        this.dialog = DOMUtils.get('custom_dialog');
        this.titleEl = DOMUtils.get('custom_dialog_title');
        this.messageEl = DOMUtils.get('custom_dialog_message');
        this.inputWrapper = DOMUtils.get('custom_dialog_input_wrapper');
        this.input = DOMUtils.get('custom_dialog_input');
        this.cancelBtn = DOMUtils.get('custom_dialog_cancel');
        this.okBtn = DOMUtils.get('custom_dialog_ok');

        this.bindEvents();
    },

    bindEvents() {
        this.cancelBtn?.addEventListener('click', () => this.onCancel());
        this.okBtn?.addEventListener('click', () => this.onOk());
        this.input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.onOk();
            if (e.key === 'Escape') this.onCancel();
        });
        this.overlay?.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.onCancel();
        });
    },

    show() {
        this.overlay?.classList.add('active');
        if (this.inputWrapper?.style.display !== 'none') {
            this.input?.focus();
        }
    },

    hide() {
        this.overlay?.classList.remove('active');
    },

    onOk() {
        const value = this.input?.value;
        this.hide();
        if (this.resolve) this.resolve(value);
    },

    onCancel() {
        this.hide();
        if (this.reject) this.reject(new Error('cancelled'));
    },

    alert(message, title = '提示') {
        return new Promise((resolve) => {
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            if (this.inputWrapper) this.inputWrapper.style.display = 'none';
            if (this.cancelBtn) this.cancelBtn.style.display = 'none';
            if (this.okBtn) this.okBtn.textContent = '确定';
            this.resolve = () => resolve(true);
            this.reject = null;
            this.show();
        });
    },

    confirm(message, title = '确认') {
        return new Promise((resolve) => {
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            if (this.inputWrapper) this.inputWrapper.style.display = 'none';
            if (this.cancelBtn) {
                this.cancelBtn.style.display = 'block';
                this.cancelBtn.textContent = '取消';
            }
            if (this.okBtn) this.okBtn.textContent = '确定';
            this.resolve = () => resolve(true);
            this.reject = () => resolve(false);
            this.show();
        });
    },

    prompt(message, defaultValue = '', title = '输入') {
        return new Promise((resolve) => {
            this.titleEl.textContent = title;
            this.messageEl.textContent = message;
            if (this.inputWrapper) this.inputWrapper.style.display = 'block';
            if (this.input) {
                this.input.value = defaultValue;
                this.input.select();
            }
            if (this.cancelBtn) {
                this.cancelBtn.style.display = 'block';
                this.cancelBtn.textContent = '取消';
            }
            if (this.okBtn) this.okBtn.textContent = '确定';
            this.resolve = () => resolve(this.input?.value);
            this.reject = () => resolve(null);
            this.show();
        });
    }
};

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIManager, BreadcrumbRenderer, Dialog };
}

// 浏览器环境：挂载到 window 对象
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
    window.BreadcrumbRenderer = BreadcrumbRenderer;
    window.Dialog = Dialog;
}
