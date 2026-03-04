#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
依赖检查程序
检查必要依赖是否安装，通过则生成认证文件，下次跳过检查
"""

import sys
import os
import subprocess
import socket
import glob
import hashlib
import json
from pathlib import Path
from datetime import datetime

# 认证文件路径
AUTH_FILE = Path(__file__).parent / ".auth"

# 协议文件路径
AGREEMENT_FILE = Path(__file__).parent / ".agreement_accepted"



# 日志目录
LOG_DIR = Path(__file__).parent / "log"
LOG_DIR.mkdir(exist_ok=True)

current_log_file = None

# 必要依赖列表
REQUIRED_PACKAGES = [
    "fastapi",
    "pydantic",
    "uvicorn",
    "python_multipart",
]


def get_timestamp():
    """获取当前时间戳"""
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def get_datetime_str():
    """获取完整日期时间字符串"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log_event(message, level="INFO"):
    """记录日志事件"""
    global current_log_file
    # 过滤掉频繁的 HTTP 访问日志
    if "POST /upload/chunk" in message or ("GET /" in message and "HTTP/1.1" in message):
        return
    if current_log_file and current_log_file.exists():
        timestamp = get_datetime_str()
        with open(current_log_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{level}] {message}\n")


def get_license_hash(config_path):
    """计算 config.json 中 license_notice 的哈希值"""
    try:
        if not config_path.exists():
            return None
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
        license_text = config.get("license_notice", "")
        return hashlib.sha256(license_text.encode("utf-8")).hexdigest()[:16]
    except Exception:
        return None


def check_license_integrity(config_path, expected_hash):
    """检查 license_notice 是否被篡改"""
    current_hash = get_license_hash(config_path)
    if current_hash is None:
        return False, None
    return current_hash == expected_hash, current_hash


def cleanup_old_logs():
    """清理旧日志，只保留最新的5个"""
    log_files = glob.glob(str(LOG_DIR / "*.log"))
    log_files = [f for f in log_files if "feedback" not in f.lower()]
    log_files.sort(key=lambda x: Path(x).stat().st_mtime)
    while len(log_files) > 5:
        oldest = log_files.pop(0)
        try:
            Path(oldest).unlink()
            print(f"(Check) 已清理旧日志: {Path(oldest).name}")
        except Exception as e:
            print(f"(Check) 清理日志失败 {oldest}: {e}")


def create_log_file():
    """创建新的日志文件"""
    global current_log_file
    cleanup_old_logs()
    timestamp = get_timestamp()
    log_file = LOG_DIR / f"{timestamp}.log"
    with open(log_file, "w", encoding="utf-8") as f:
        f.write(f"[{get_datetime_str()}] [INFO] 服务器启动\n")
        f.write(f"[{get_datetime_str()}] [INFO] 工作目录: {Path(__file__).parent}\n")
        f.write(f"[{get_datetime_str()}] [INFO] Python版本: {sys.version}\n")
    current_log_file = log_file
    return log_file


def close_log_file(is_normal=True):
    """关闭日志文件"""
    global current_log_file
    if current_log_file and current_log_file.exists():
        timestamp = get_datetime_str()
        status = "正常关闭" if is_normal else "意外关闭"
        return_code = 0 if is_normal else 1
        with open(current_log_file, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [INFO] 服务器{status}\n")
            f.write(f"[{timestamp}] [INFO] 返回码: {return_code}\n")


def check_dependencies():
    """检查所有依赖是否已安装"""
    missing = []
    
    for package in REQUIRED_PACKAGES:
        try:
            import_name = package
            if package == "python_multipart":
                import_name = "multipart"
            __import__(import_name)
        except ImportError:
            missing.append(package)
    
    return missing


def install_dependencies(packages):
    """自动安装缺失的依赖"""
    if not packages:
        return True
    
    print(f"(Check) 正在安装依赖: {', '.join(packages)}")
    log_event(f"开始安装依赖: {packages}")
    
    try:
        # 使用 pip 安装依赖
        cmd = [sys.executable, "-m", "pip", "install"] + packages
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode == 0:
            print(f"(Check) 依赖安装成功")
            log_event(f"依赖安装成功: {packages}")
            return True
        else:
            print(f"(Check) 依赖安装失败:")
            print(result.stderr)
            log_event(f"依赖安装失败: {result.stderr}", "ERROR")
            return False
    except Exception as e:
        print(f"(Check) 安装依赖时出错: {e}")
        log_event(f"安装依赖时出错: {e}", "ERROR")
        return False


def create_auth_file():
    """创建认证文件"""
    try:
        AUTH_FILE.write_text("dependencies_checked", encoding="utf-8")
        return True
    except Exception as e:
        print(f"(Check) 警告: 无法创建认证文件: {e}")
        log_event(f"无法创建认证文件: {e}", "WARN")
        return False


def remove_auth_file():
    """删除认证文件"""
    try:
        if AUTH_FILE.exists():
            AUTH_FILE.unlink()
            log_event("认证文件已删除")
    except Exception:
        pass


def load_full_agreement():
    """从 LISENCE.txt 加载完整协议"""
    license_file = Path(__file__).parent / "LISENCE.txt"
    if license_file.exists():
        try:
            with open(license_file, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"(Check) 警告: 无法读取协议文件: {e}")
            return None
    return None


def check_agreement():
    """检查用户是否已同意协议，首次启动询问是否同意"""
    if AGREEMENT_FILE.exists():
        return True
    
    # 首次启动，询问是否同意协议
    print("\n" + "=" * 80)
    print("                              用户协议")
    print("=" * 80)
    print()
    print("本软件基于 GPL-3.0 协议开源。")
    print()
    print("使用本软件即表示您同意遵守 GPL-3.0 协议的所有条款。")
    print("完整协议内容请参阅 LICENSE 文件。")
    print()
    print("您是否同意以上协议条款？")
    print()
    print('输入 "yes" 或 "y" 表示同意并继续')
    print('输入 "no" 或 "n" 表示不同意并退出')
    print()
    print("=" * 80 + "\n")
    
    while True:
        choice = input("您的选择: ").strip().lower()
        
        if choice in ("yes", "y", "同意"):
            try:
                AGREEMENT_FILE.write_text("agreed", encoding="utf-8")
                print("\n(Check) 感谢您的同意，继续启动...\n")
                log_event("用户同意协议")
                return True
            except Exception as e:
                print(f"\n(Check) 错误: 无法保存协议状态: {e}")
                log_event(f"保存协议状态失败: {e}", "ERROR")
                return False
        
        elif choice in ("no", "n", "不同意", "拒绝"):
            print("\n(Check) 您必须同意协议才能使用本软件。")
            log_event("用户拒绝协议", "WARN")
            return False
        
        else:
            print("\n(Check) 请输入 yes 或 no")


def check_port_available(host, port):
    """检查端口是否可用"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind((host, port))
        sock.close()
        return True
    except socket.error as e:
        return False


def parse_bandwidth(bandwidth_str):
    """解析带宽字符串，返回 bytes/s"""
    bandwidth_str = bandwidth_str.lower().strip()
    
    if bandwidth_str == "0" or bandwidth_str == "0mb/s" or bandwidth_str == "0kb/s":
        return 0  # 0 表示不限速
    
    if bandwidth_str.endswith("mb/s"):
        return int(float(bandwidth_str[:-4]) * 1024 * 1024)
    elif bandwidth_str.endswith("kb/s"):
        return int(float(bandwidth_str[:-4]) * 1024)
    else:
        # 默认当作 mb/s 处理
        return int(float(bandwidth_str) * 1024 * 1024)


def start_core(host="0.0.0.0", port=8000, root_dir="D:/test_root", max_bandwidth="0mb/s", license_valid=True):
    """启动核心程序"""
    core_path = Path(__file__).parent / "core.py"

    # 设置环境变量
    os.environ["HOST"] = host
    os.environ["PORT"] = str(port)
    os.environ["ROOT_DIR"] = root_dir
    os.environ["LICENSE_VALID"] = "1" if license_valid else "0"
    
    # 解析带宽限制
    bytes_per_sec = parse_bandwidth(max_bandwidth)
    os.environ["MAX_BANDWIDTH_BYTES"] = str(bytes_per_sec)
    
    # 显示带宽信息
    if bytes_per_sec == 0:
        log_event("带宽限制: 无限制")
    elif bytes_per_sec >= 1024 * 1024:
        log_event(f"带宽限制: {bytes_per_sec / (1024 * 1024):.2f} MB/s")
    else:
        log_event(f"带宽限制: {bytes_per_sec / 1024:.2f} KB/s")
    
    print(f"(Check) 启动核心程序...")
    log_event(f"启动核心程序: {core_path}")
    
    process = subprocess.Popen(
        [sys.executable, str(core_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # 实时读取并显示输出
    while True:
        line = process.stdout.readline()
        if not line and process.poll() is not None:
            break
        if line:
            line = line.rstrip()
            print(line)
            # 过滤HTTP日志
            if not (' - "' in line and 'HTTP/1.1"' in line):
                log_event(line)
    
    return process.poll()


def main():
    """主函数"""
    global current_log_file
    
    # 检查是否是首次启动（协议文件不存在）
    is_first_run = not AGREEMENT_FILE.exists()
    
    # 检查用户协议（首次启动）
    if not check_agreement():
        sys.exit(1)
    
    # 创建日志文件
    current_log = create_log_file()
    print(f"(Check) 日志文件: {current_log.name}")
    
    if is_first_run:
        log_event("首次启动，已展示完整协议")

    # 加载配置
    config_path = Path(__file__).parent / "config.json"
    host = "0.0.0.0"
    port = 8000
    root_dir = "D:/test_root"
    max_bandwidth = "0mb/s"  # 0 表示不限速
    show_license_notice = True  # 默认显示开源声明

    if config_path.exists():
        try:
            import json
            with open(config_path, "r", encoding="utf-8") as f:
                config = json.load(f)
            host = config.get("host", "0.0.0.0")
            port = config.get("port", 8000)
            root_dir = config.get("root_dir", "D:/test_root")
            max_bandwidth = config.get("max_bandwidth", "0mb/s")
            show_license_notice = config.get("show_license_notice", True)
            log_event(f"加载配置: host={host}, port={port}, root_dir={root_dir}, max_bandwidth={max_bandwidth}")
        except Exception as e:
            log_event(f"加载配置失败: {e}", "WARN")
    else:
        # 创建默认配置文件
        try:
            default_config = {
                "host": "0.0.0.0",
                "port": 8000,
                "root_dir": "D:/test_root",
                "max_bandwidth": "0mb/s",
                "show_license_notice": True
            }
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=4, ensure_ascii=False)
            log_event("创建默认配置文件")
        except Exception as e:
            log_event(f"创建默认配置文件失败: {e}", "WARN")

    # 显示开源声明（非首次启动时才显示简要协议）
    if show_license_notice and not is_first_run:
        license_text = config.get("license_notice", "")
        if license_text:
            print("\n" + "=" * 80)
            print("                              开源声明")
            print("=" * 80)
            print()
            print(license_text)
            print()
            print("=" * 80 + "\n")
            log_event("显示开源声明")

    # 检查根目录是否存在
    root_path = Path(root_dir)
    if not root_path.exists():
        log_event(f"根目录不存在: {root_dir}", "ERROR")
        print(f"\n{'='*60}")
        print("                     错误")
        print(f"{'='*60}")
        print(f"\n根目录不存在: {root_dir}")
        print("\n请检查 config.json 中的 root_dir 配置")
        print(f"{'='*60}\n")

        while True:
            choice = input("请选择: [R]重试 / [Q]退出: ").strip().lower()
            if choice in ("r", "retry", "restart", "重试"):
                log_event("用户选择重试根目录检查")
                # 重新加载配置
                if config_path.exists():
                    try:
                        with open(config_path, "r", encoding="utf-8") as f:
                            config = json.load(f)
                        root_dir = config.get("root_dir", "D:/test_root")
                        root_path = Path(root_dir)
                        if root_path.exists():
                            log_event(f"根目录检查通过: {root_dir}")
                            break
                        else:
                            print(f"\n根目录仍然不存在: {root_dir}\n")
                    except Exception as e:
                        log_event(f"重新加载配置失败: {e}", "ERROR")
                        print(f"\n配置加载失败: {e}\n")
            elif choice in ("q", "quit", "exit", "退出"):
                log_event("用户选择退出（根目录不存在）", "WARN")
                close_log_file(is_normal=False)
                sys.exit(0)
            else:
                print("请输入 R 或 Q")

    log_event(f"根目录检查通过: {root_dir}")

    # 检查协议完整性（哈希值检测）- 静默执行
    # 原始协议内容的哈希值（本软件基于 GPL-3.0 开源，免费供个人学习使用，严禁销售或转售。作者保留开发扩展功能和增值服务的权利。）
    EXPECTED_LICENSE_HASH = "977ca24b5276815e"
    is_valid, current_hash = check_license_integrity(config_path, EXPECTED_LICENSE_HASH)
    if is_valid:
        log_event("协议完整性检查通过")
    else:
        log_event(f"协议被修改，当前哈希: {current_hash}", "WARN")

    # 检查依赖
    if not AUTH_FILE.exists():
        print("(Check) 正在检查依赖...")
        log_event("开始检查依赖")
        
        missing = check_dependencies()
        
        if missing:
            print(f"(Check) 检测到缺失依赖: {', '.join(missing)}")
            log_event(f"检测到缺失依赖: {missing}", "WARN")
            
            # 自动安装依赖
            if install_dependencies(missing):
                # 重新检查依赖是否安装成功
                still_missing = check_dependencies()
                if still_missing:
                    print(f"(Check) 错误: 以下依赖未能成功安装:")
                    for pkg in still_missing:
                        print(f"  - {pkg}")
                    print(f"(Check) 请手动运行: pip install -r requirements.txt")
                    log_event(f"依赖安装后仍缺失: {still_missing}", "ERROR")
                    close_log_file(is_normal=False)
                    input("按回车键退出...")
                    sys.exit(1)
            else:
                print(f"(Check) 自动安装依赖失败，请手动运行: pip install -r requirements.txt")
                log_event("自动安装依赖失败", "ERROR")
                close_log_file(is_normal=False)
                input("按回车键退出...")
                sys.exit(1)
        
        print("(Check) 所有依赖检查通过")
        log_event("依赖检查通过")
        
        if create_auth_file():
            print("(Check) 认证文件已生成")
    else:
        print("(Check) 检测到认证文件，跳过依赖检查")
        log_event("跳过依赖检查（认证文件存在）")
    
    # 检查端口
    restart_count = 0
    max_restarts = 3
    
    while True:
        if not check_port_available(host, port):
            log_event(f"端口 {port} 被占用", "ERROR")
            print(f"\n{'='*60}")
            print("(Check) 错误: 端口被占用")
            print(f"(Check) 端口 {port} 已被其他程序使用")
            print(f"{'='*60}\n")
            
            while True:
                choice = input("请选择: [R]重试 / [Q]退出: ").strip().lower()
                if choice in ("r", "retry", "restart", "重试"):
                    log_event("用户选择重试端口检查")
                    break
                elif choice in ("q", "quit", "exit", "退出"):
                    log_event("用户选择退出（端口被占用）", "WARN")
                    close_log_file(is_normal=False)
                    sys.exit(0)
                else:
                    print("(Check) 请输入 R 或 Q")
            continue
        
        log_event(f"端口 {port} 检查通过")
        
        # 启动服务器
        try:
            print(f"(Check) 服务器正在运行 (端口: {port})...")
            print("(Check) 按 Ctrl+C 停止服务器\n")
            log_event("开始启动服务器")
            
            result_code = start_core(host, port, root_dir, max_bandwidth, license_valid=is_valid)
            
            if result_code != 0:
                restart_count += 1
                log_event(f"服务器异常退出，返回码: {result_code}", "ERROR")
                print(f"\n(Check) 服务器异常退出")
                
                # 清除认证文件，下次重新检查
                remove_auth_file()
                
                if restart_count >= max_restarts:
                    log_event(f"达到最大重启次数 ({max_restarts})", "ERROR")
                    print(f"(Check) 已达到最大重启次数 ({max_restarts})")
                    close_log_file(is_normal=False)
                    input("按回车键退出...")
                    sys.exit(1)
                
                close_log_file(is_normal=False)
                current_log = create_log_file()
                
                while True:
                    choice = input("请选择: [R]重启 / [Q]退出: ").strip().lower()
                    if choice in ("r", "restart", "重启"):
                        print("(Check) 正在重启服务器...\n")
                        break
                    elif choice in ("q", "quit", "exit", "退出"):
                        log_event("用户选择退出")
                        sys.exit(0)
                    else:
                        print("(Check) 请输入 R 或 Q")
            else:
                log_event(f"服务器正常退出，返回码: {result_code}")
                close_log_file(is_normal=True)
                break
                
        except KeyboardInterrupt:
            print("\n(Check) 用户中断")
            log_event("用户通过 Ctrl+C 中断")
            close_log_file(is_normal=True)
            sys.exit(0)


def cleanup_auth():
    """清理认证文件"""
    try:
        if AUTH_FILE.exists():
            AUTH_FILE.unlink()
            print("(Check) 认证文件已清除")
    except Exception:
        pass


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--cleanup":
        cleanup_auth()
        sys.exit(0)
    
    main()