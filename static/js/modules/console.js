/**
 * 开发者控制台模块
 * 按5下Ctrl打开，支持指令补全和执行
 */

const DevConsole = {
    commands: ['help', 'lisence', 'say', 'clear'],
    suggestionIndex: -1,
    currentSuggestions: [],
    commandList: null,

    async init() {
        this.elements = {
            console: document.getElementById('dev_console'),
            output: document.getElementById('dev_console_output'),
            input: document.getElementById('dev_console_input'),
            close: document.getElementById('dev_console_close'),
            suggestions: document.getElementById('dev_console_suggestions')
        };

        if (!this.elements.console) return;

        // 加载指令列表
        await this.loadCommandList();

        this.bindEvents();
        this.setupCtrlTrigger();
    },

    async loadCommandList() {
        try {
            const response = await fetch('/command/command_list.json');
            if (response.ok) {
                this.commandList = await response.json();
            }
        } catch (err) {
            console.error('加载指令列表失败:', err);
        }
    },

    setupCtrlTrigger() {
        let ctrlCount = 0;
        let ctrlTimer = null;

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control') {
                ctrlCount++;
                if (ctrlTimer) clearTimeout(ctrlTimer);
                ctrlTimer = setTimeout(() => {
                    ctrlCount = 0;
                }, 1000);

                if (ctrlCount >= 5) {
                    ctrlCount = 0;
                    this.open();
                }
            }
        });
    },

    bindEvents() {
        this.elements.close.addEventListener('click', () => this.close());

        this.elements.input.addEventListener('input', () => this.updateSuggestions());

        this.elements.input.addEventListener('keydown', (e) => this.handleKeydown(e));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#dev_console')) {
                this.hideSuggestions();
            }
        });

        // 拖动功能
        this.setupDrag();
    },

    setupDrag() {
        const header = document.getElementById('dev_console_header');
        const consoleEl = this.elements.console;
        
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            // 忽略关闭按钮的点击
            if (e.target.id === 'dev_console_close') return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            startLeft = consoleEl.offsetLeft;
            startTop = consoleEl.offsetTop;
            
            header.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            consoleEl.style.left = (startLeft + dx) + 'px';
            consoleEl.style.top = (startTop + dy) + 'px';
            consoleEl.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'move';
            }
        });
    },

    open() {
        this.elements.console.classList.add('active');
        this.elements.input.focus();
    },

    close() {
        this.elements.console.classList.remove('active');
        this.hideSuggestions();
    },

    log(msg, type = 'log') {
        const div = document.createElement('div');
        div.className = 'console-' + type;
        div.textContent = '> ' + msg;
        this.elements.output.appendChild(div);
        this.elements.output.scrollTop = this.elements.output.scrollHeight;
    },

    updateSuggestions() {
        const input = this.elements.input.value;
        if (!input.startsWith('/')) {
            this.hideSuggestions();
            return;
        }

        const withoutSlash = input.slice(1);
        const parts = withoutSlash.split(' ');
        const cmd = parts[0];
        const subCmd = parts[1] || '';

        // 如果已经输入了主指令和空格，显示子指令或参数提示
        if (parts.length > 1 && this.commands.includes(cmd)) {
            const cmdInfo = this.commandList?.commands?.find(c => c.name === cmd);
            if (cmdInfo) {
                // help 指令特殊处理：补全其他指令名
                if (cmd === 'help') {
                    const otherCommands = this.commands.filter(c => c !== 'help');
                    const matches = otherCommands.filter(c => c.startsWith(subCmd));
                    if (matches.length > 0) {
                        this.showSubSuggestions(cmd, matches.map(name => ({ name })), subCmd);
                        return;
                    }
                }
                // 有子指令的（如 lisence）
                if (cmdInfo.params && cmdInfo.params.length > 0) {
                    // 过滤匹配的子指令
                    const matches = cmdInfo.params.filter(p => p.name.startsWith(subCmd));
                    this.showSubSuggestions(cmd, matches, subCmd);
                    return;
                }
                // 需要参数的（如 say）
                if (cmd === 'say') {
                    this.showParamHint(cmd, '<message>');
                    return;
                }
            }
            this.hideSuggestions();
            return;
        }

        // 主指令补全
        const matches = this.commands.filter(c => c.startsWith(cmd));
        this.showSuggestions(matches);
    },

    showSuggestions(matches) {
        this.currentSuggestions = matches;
        this.suggestionIndex = -1;
        this.elements.suggestions.innerHTML = '';

        if (matches.length === 0) {
            this.elements.suggestions.classList.remove('active');
            return;
        }

        matches.forEach((cmd, index) => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = '/' + cmd;
            div.dataset.index = index;
            div.addEventListener('click', () => {
                this.elements.input.value = '/' + cmd + ' ';
                this.elements.input.focus();
                this.updateSuggestions();
            });
            this.elements.suggestions.appendChild(div);
        });

        this.elements.suggestions.classList.add('active');
    },

    showSubSuggestions(parentCmd, params, partial) {
        this.currentSuggestions = params.map(p => p.name);
        this.suggestionIndex = -1;
        this.elements.suggestions.innerHTML = '';

        if (params.length === 0) {
            this.elements.suggestions.classList.remove('active');
            return;
        }

        params.forEach((param, index) => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = `/${parentCmd} ${param.name}`;
            div.dataset.index = index;
            div.addEventListener('click', () => {
                this.elements.input.value = `/${parentCmd} ${param.name} `;
                this.hideSuggestions();
                this.elements.input.focus();
            });
            this.elements.suggestions.appendChild(div);
        });

        this.elements.suggestions.classList.add('active');
    },

    showParamHint(cmd, hint) {
        this.currentSuggestions = [hint];
        this.suggestionIndex = -1;
        this.elements.suggestions.innerHTML = '';

        const div = document.createElement('div');
        div.className = 'suggestion-item hint';
        div.textContent = `/${cmd} ${hint}`;
        div.style.color = '#888';
        div.style.fontStyle = 'italic';
        this.elements.suggestions.appendChild(div);

        this.elements.suggestions.classList.add('active');
    },

    hideSuggestions() {
        this.elements.suggestions.classList.remove('active');
        this.suggestionIndex = -1;
        this.currentSuggestions = [];
    },

    updateSelection() {
        const items = this.elements.suggestions.querySelectorAll('.suggestion-item');
        items.forEach((item, index) => {
            if (index === this.suggestionIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    },

    handleKeydown(e) {
        // 上下键选择建议
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (this.currentSuggestions.length > 0) {
                this.suggestionIndex = (this.suggestionIndex + 1) % this.currentSuggestions.length;
                this.updateSelection();
            }
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (this.currentSuggestions.length > 0) {
                this.suggestionIndex = (this.suggestionIndex - 1 + this.currentSuggestions.length) % this.currentSuggestions.length;
                this.updateSelection();
            }
            return;
        }

        // Tab 键使用当前选中的建议
        if (e.key === 'Tab') {
            e.preventDefault();
            const input = this.elements.input.value;
            const parts = input.slice(1).split(' ');
            
            if (this.suggestionIndex >= 0 && this.currentSuggestions[this.suggestionIndex]) {
                const selected = this.currentSuggestions[this.suggestionIndex];
                if (parts.length > 1) {
                    // 子指令补全
                    this.elements.input.value = `/${parts[0]} ${selected} `;
                } else {
                    // 主指令补全
                    this.elements.input.value = `/${selected} `;
                }
                this.hideSuggestions();
                this.updateSuggestions();
            } else if (this.currentSuggestions.length > 0) {
                const selected = this.currentSuggestions[0];
                if (parts.length > 1) {
                    this.elements.input.value = `/${parts[0]} ${selected} `;
                } else {
                    this.elements.input.value = `/${selected} `;
                }
                this.hideSuggestions();
                this.updateSuggestions();
            }
            return;
        }

        // ESC 隐藏建议
        if (e.key === 'Escape') {
            this.hideSuggestions();
            return;
        }

        // Enter 执行命令
        if (e.key === 'Enter') {
            // 如果有选中的建议，使用它
            if (this.suggestionIndex >= 0 && this.currentSuggestions[this.suggestionIndex]) {
                this.elements.input.value = '/' + this.currentSuggestions[this.suggestionIndex];
            }
            this.hideSuggestions();
            this.executeCommand();
        }
    },

    executeCommand() {
        const input = this.elements.input.value;
        this.log('> ' + input);

        if (input.startsWith('/')) {
            const cmd = input.slice(1).split(' ')[0];

            switch (cmd) {
                case 'help':
                    const helpArgs = input.slice(5).trim();
                    
                    if (helpArgs) {
                        // 查看特定指令的用法
                        const targetCmd = helpArgs.split(' ')[0];
                        const cmdInfo = this.commandList?.commands?.find(c => c.name === targetCmd);
                        
                        if (cmdInfo) {
                            this.log(`用法: ${cmdInfo.format}`, 'warn');
                            this.log(cmdInfo.description);
                            if (cmdInfo.params && cmdInfo.params.length > 0) {
                                this.log('参数:', 'warn');
                                cmdInfo.params.forEach(param => {
                                    this.log(`  ${param.name} - ${param.description}`);
                                });
                            }
                        } else {
                            this.log(`未知指令: ${targetCmd}`, 'error');
                            this.log('输入 /help 查看所有可用指令', 'warn');
                        }
                    } else {
                        // 显示所有指令
                        this.log('可用命令:', 'warn');
                        if (this.commandList && this.commandList.commands) {
                            this.commandList.commands.forEach(cmd => {
                                this.log(`  ${cmd.format} - ${cmd.description}`);
                            });
                        } else {
                            this.log('  /help {command} - 查看指令用法');
                            this.log('  /lisence {show|failed} - 开源声明操作');
                            this.log('  /say <message> - 发送消息');
                            this.log('  /clear - 清理控制台输出');
                        }
                        this.log('');
                        this.log('输入 /help <指令名> 查看详细用法', 'warn');
                    }
                    break;
                case 'lisence':
                    const lisenceArgs = input.slice(9).trim().split(' ');
                    const subCmd = lisenceArgs[0];
                    
                    if (subCmd === 'show') {
                        this.log('开源声明 (简要):', 'warn');
                        this.log('本软件完全开源免费，仅供个人学习与非商业用途，严禁任何形式的销售与转售行为。');
                    } else if (subCmd === 'failed') {
                        this.log('触发蓝屏...', 'success');
                        setTimeout(() => {
                            window.location.href = '/bsod';
                        }, 500);
                    } else {
                        // 只输入了头指令，没有参数，显示红色错误格式
                        this.log('错误的格式 /lisence {path}', 'error');
                    }
                    break;
                case 'say':
                    const message = input.slice(5).trim();
                    if (message) {
                        this.log('发送消息到服务器...');
                        fetch('/api/say', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ message: message })
                        })
                        .then(res => res.json())
                        .then(data => {
                            if (data.ok) {
                                this.log(data.message, 'success');
                            } else {
                                this.log('发送失败', 'error');
                            }
                        })
                        .catch(err => {
                            this.log('发送失败: ' + err.message, 'error');
                        });
                    } else {
                        // 只输入了头指令，没有参数，显示红色错误格式
                        this.log('错误的格式 /say <message>', 'error');
                    }
                    break;
                case 'clear':
                    this.elements.output.innerHTML = '';
                    this.log('控制台已清理', 'success');
                    break;
                default:
                    if (cmd) {
                        this.log('未知命令: ' + cmd, 'error');
                        this.log('输入 /help 查看可用命令', 'warn');
                    }
            }
        } else if (input) {
            this.log(input);
        }

        this.elements.input.value = '';
    }
};

// 浏览器环境：挂载到 window
if (typeof window !== 'undefined') {
    window.DevConsole = DevConsole;
}
