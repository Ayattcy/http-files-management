# HTTP File Manager

一个轻量级、图形化的本地文件管理系统，是我深陷在网盘下载限速的绝望之中的癫疯之作。

[![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com)
[![License](https://img.shields.io/badge/License-GPL--3.0-orange.svg)](LICENSE)

## 项目简介

这是一个基于 **FastAPI** 开发的本地文件管理工具，提供简洁易用的 Web 界面，让你能够通过浏览器轻松管理本地文件。无论是文件上传、下载，还是目录浏览，都能流畅完成。

**诞生背景**：这个项目源于作者在校园网环境下，受够了网盘下载限速的折磨，于是利用课余时间开发的"癫疯之作"。虽然代码可能不够完美，但希望能帮助到同样困扰的你。

## 功能特性

- **文件浏览** - 直观的目录树结构，快速定位文件
- **文件上传** - 支持拖拽上传，断点续传，大文件也不怕
- **文件下载** - 支持限速下载，避免占用全部带宽
- **在线预览** - 图片、视频、音频文件可直接预览（大视频可能因带宽等原因体验不是很好）
- **响应式设计** - 完美适配电脑、平板、手机等多种设备
- **文件搜索** - 快速搜索目标文件
- **WebSocket 实时同步** - 文件变动即时刷新
- **现代化 UI** - 简洁美观的界面设计

## 安装与使用

### 环境要求

- Python 3.8 或更高版本
- pip 包管理器

### 快速开始

1. **克隆仓库**

```bash
git clone https://github.com/Ayattcy/http-files-management.git
cd http-files-management
```

2. **安装依赖**

```bash
pip install -r requirements.txt
```

或者直接运行 `check.py`，它会自动检测并安装缺失的依赖：

```bash
python check.py
```

3. **启动服务**

```bash
python check.py
```

或者使用提供的批处理文件（Windows）：

```bash
run.bat
```

4. **访问应用**

打开浏览器，访问 `http://localhost:8000`（或者映射到公网上）

### 配置说明

编辑 `config.json` 文件可自定义以下配置：

```json
{
    "host": "0.0.0.0",        // 监听地址
    "port": 8000,             // 监听端口
    "root_dir": "home/",      // 文件根目录
    "max_bandwidth": "0mb/s"  // 下载限速（0表示不限速）
}
```

## 参与贡献

作为一个编程新手，我深知代码还有很多可以改进的地方。如果你有：

- 好的功能建议
- 发现了 Bug
- 想要优化代码结构
- 希望完善文档

都欢迎提交 Issue 或 Pull Request！让我们一起把这个小工具做得更好。

**提示**：前端部分代码使用了 AI 辅助生成，如有问题还请多多包涵，期待大佬们前来指点一二

## 开源协议

本项目基于 **GPL-3.0** 协议开源：

- 允许个人学习使用
- 允许查看和修改源代码
- 允许在非商业场景下分发
- 禁止商业销售或转售
- 禁止移除版权声明

详细协议内容请参阅 [LICENSE](LICENSE) 文件。

## 借物表

- [FastAPI](https://fastapi.tiangolo.com/) - 框架
- [Uvicorn](https://www.uvicorn.org/) - 服务器
- [HarmonyOS Sans](https://developer.harmonyos.com/cn/docs/design/font-0000001157868583) - 字体
- [Microsoft Windows Sound Effects](https://support.microsoft.com/) - 系统音效资源

---
