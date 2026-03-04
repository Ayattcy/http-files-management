import json
import os
import json
import shutil
import hashlib
import urllib.parse
from pathlib import Path
from pydantic import BaseModel
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Body
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, RedirectResponse, HTMLResponse
from starlette.background import BackgroundTask

app = FastAPI()

# 从环境变量读取配置
ROOT_DIR = Path(os.environ.get("ROOT_DIR", "D:/test_root"))
ROOT_DIR.mkdir(exist_ok=True)

# 带宽限制（字节/秒，0表示不限速）
MAX_BANDWIDTH = int(os.environ.get("MAX_BANDWIDTH_BYTES", "0"))

# 协议完整性检查状态
LICENSE_VALID = os.environ.get("LICENSE_VALID", "1") == "1"

# 加载配置文件
CONFIG_PATH = Path(__file__).parent / "config.json"
LICENSE_ERROR_URL = "https://www.example.com/license_error"
try:
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config_data = json.load(f)
        LICENSE_ERROR_URL = config_data.get("license_error_url", LICENSE_ERROR_URL)
except Exception:
    pass

id_to_path = {}
path_to_id = {}

# 日志功能
LOG_DIR = Path(__file__).parent / "log"
LOG_DIR.mkdir(exist_ok=True)
current_log_file = None

def get_timestamp():
    from datetime import datetime
    return datetime.now().strftime("%Y%m%d_%H%M%S")

def get_datetime_str():
    from datetime import datetime
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def log_event(message, level="INFO"):
    global current_log_file
    if current_log_file is None:
        timestamp = get_timestamp()
        current_log_file = LOG_DIR / f"{timestamp}.log"
        with open(current_log_file, "w", encoding="utf-8") as f:
            f.write(f"[{get_datetime_str()}] [INFO] 服务器启动\n")
    
    timestamp = get_datetime_str()
    log_line = f"[{timestamp}] [{level}] {message}\n"
    with open(current_log_file, "a", encoding="utf-8") as f:
        f.write(log_line)
    
    # 同时打印到控制台
    print(f"(Core) {message}")

def get_path_hash(real_path: Path) -> str:
    key = str(real_path.resolve()).lower()
    return hashlib.md5(key.encode()).hexdigest()[:12]

def get_or_create_id(real_path: Path) -> str:
    key = str(real_path.resolve())
    if key not in path_to_id:
        vid = get_path_hash(real_path)
        path_to_id[key] = vid
        id_to_path[vid] = real_path
    return path_to_id[key]

def scan_dir(path: Path) -> list:
    items = []
    try:
        for entry in sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            if entry.name.startswith('.') or entry.suffix.lower() == '.lnk':
                continue
            vid = get_or_create_id(entry)
            items.append({
                "id": vid,
                "name": entry.name,
                "type": "dir" if entry.is_dir() else "file",
                "size": entry.stat().st_size if entry.is_file() else 0,
                "mtime": int(entry.stat().st_mtime)
            })
    except PermissionError:
        pass
    return items

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)
            cmd = data.get("cmd")
            if cmd == "ls":
                path = data.get("path", "/")
                real_path = ROOT_DIR / path.lstrip("/")
                items = scan_dir(real_path)
                await ws.send_json({
                    "type": "ls",
                    "path": path,
                    "items": items
                })
            elif cmd == "mv":
                item_id = data["id"]
                new_name = data["name"]
                real_path = id_to_path.get(item_id)
                if real_path and real_path.exists():
                    new_path = real_path.parent / new_name
                    real_path.rename(new_path)
                    del path_to_id[str(real_path.resolve())]
                    new_id = get_or_create_id(new_path)
                    await ws.send_json({
                        "type": "diff",
                        "changes": [{"op": "mod", "id": new_id, "name": new_name}]
                    })
            elif cmd == "rm":
                for item_id in data.get("ids", []):
                    real_path = id_to_path.get(item_id)
                    if real_path and real_path.exists():
                        if real_path.is_dir():
                            shutil.rmtree(real_path)
                        else:
                            real_path.unlink()
                        del path_to_id[str(real_path.resolve())]
                        del id_to_path[item_id]
                await ws.send_json({
                    "type": "diff",
                    "changes": [{"op": "del", "id": i} for i in data.get("ids", [])]
                })
            elif cmd == "mkdir":
                path = data.get("path", "/")
                name = data.get("name", "新建文件夹")
                real_path = ROOT_DIR / path.lstrip("/") / name
                real_path.mkdir(exist_ok=True)
                items = scan_dir(ROOT_DIR / path.lstrip("/"))
                await ws.send_json({
                    "type": "ls",
                    "path": path,
                    "items": items
                })
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        try:
            await ws.send_json({"type": "error", "msg": str(e)})
        except:
            pass

MIME_TYPES = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain',
    '.py': 'text/plain',
    '.js': 'text/plain',
    '.css': 'text/plain',
    '.html': 'text/html',
    '.json': 'application/json',
    '.xml': 'text/xml',
    '.ini': 'text/plain',
    '.c': 'text/plain',
    '.cpp': 'text/plain',
    '.h': 'text/plain',
    '.java': 'text/plain',
    '.log': 'text/plain',
    '.md': 'text/plain',
	'.toml':'text/plain',
}

import asyncio
import time

async def read_file_chunked(file_path: Path, chunk_size: int = 64 * 1024):
    """分块读取文件，支持带宽限制"""
    bytes_per_sec = MAX_BANDWIDTH
    
    with open(file_path, "rb") as f:
        while True:
            start_time = time.time()
            chunk = f.read(chunk_size)
            if not chunk:
                break
            
            yield chunk
            
            # 带宽限制
            if bytes_per_sec > 0:
                elapsed = time.time() - start_time
                expected_time = len(chunk) / bytes_per_sec
                if expected_time > elapsed:
                    await asyncio.sleep(expected_time - elapsed)


@app.get("/file/{file_id}")
async def download_file(file_id: str):
    real_path = id_to_path.get(file_id)
    if not real_path:
        rebuild_id_mapping()
        real_path = id_to_path.get(file_id)
    if not real_path or not real_path.is_file():
        return {"error": "Not found"}
    ext = real_path.suffix.lower()
    media_type = MIME_TYPES.get(ext, 'application/octet-stream')
    inline_types = {
        'application/pdf', 'image/jpeg', 'image/png', 'image/gif',
        'image/bmp', 'image/webp', 'image/svg+xml', 'video/mp4',
        'video/x-msvideo', 'video/x-matroska', 'video/quicktime',
        'audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg',
        'text/plain', 'text/html', 'application/json', 'text/xml'
    }
    
    # 如果有带宽限制且不是内联类型，使用流式响应
    if MAX_BANDWIDTH > 0 and media_type not in inline_types:
        return StreamingResponse(
            read_file_chunked(real_path),
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{real_path.name}"'
            }
        )
    
    if media_type in inline_types:
        return FileResponse(path=real_path, media_type=media_type)
    else:
        # 使用原始文件名，不进行 URL 编码
        return FileResponse(
            path=real_path,
            filename=real_path.name,
            media_type=media_type
        )

@app.post("/upload")
async def upload_file(path: str = "/", file: UploadFile = File(...)):
    try:
        target_dir = ROOT_DIR / path.lstrip("/")
        # 确保目标目录存在
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / file.filename
        with open(target_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        return {"ok": True, "name": file.filename}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/paste")
async def paste(data: dict):
    action = data.get("action")
    items = data.get("items", [])
    target = data.get("target", "/")
    target_dir = ROOT_DIR / target.lstrip("/")
    for item_id in items:
        src = id_to_path.get(item_id)
        if not src:
            rebuild_id_mapping()
            src = id_to_path.get(item_id)
        if not src or not src.exists():
            continue
        dst = target_dir / src.name
        counter = 1
        stem = dst.stem
        suffix = dst.suffix
        while dst.exists():
            dst = target_dir / f"{stem} ({counter}){suffix}"
            counter += 1
        if action == "copy":
            if src.is_dir():
                shutil.copytree(src, dst)
            else:
                shutil.copy2(src, dst)
        elif action == "cut":
            shutil.move(str(src), str(dst))
            del path_to_id[str(src.resolve())]
            get_or_create_id(dst)
    return {"ok": True}

def rebuild_id_mapping():
    def scan_recursive(path: Path):
        try:
            for entry in path.iterdir():
                if entry.name.startswith('.') or entry.suffix.lower() == '.lnk':
                    continue
                get_or_create_id(entry)
                if entry.is_dir():
                    scan_recursive(entry)
        except PermissionError:
            pass
    scan_recursive(ROOT_DIR)

@app.get("/api/status")
async def get_status():
    """获取服务器状态，包括协议完整性检查结果"""
    return {
        "license_valid": LICENSE_VALID
    }

@app.get("/bsod")
async def bsod():
    """蓝屏页面 - 协议被篡改时显示"""
    try:
        bsod_path = Path(__file__).parent / "static" / "bsod.html"
        with open(bsod_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        # 替换链接
        html_content = html_content.replace(
            "https://www.example.com/license_error",
            LICENSE_ERROR_URL
        )
        return HTMLResponse(content=html_content)
    except Exception:
        return FileResponse("static/bsod.html")

@app.get("/")
async def root():
    """首页 - 如果协议被篡改则重定向到蓝屏页面"""
    if not LICENSE_VALID:
        return RedirectResponse(url="/bsod")
    return FileResponse("static/index.html")

app.mount("/font", StaticFiles(directory="font"), name="font")
app.mount("/sounds", StaticFiles(directory="sounds"), name="sounds")

# 静态资源路由
@app.get("/css/{path:path}")
async def css(path: str):
    return FileResponse(f"static/css/{path}")

@app.get("/js/{path:path}")
async def js(path: str):
    return FileResponse(f"static/js/{path}")

@app.get("/img/{path:path}")
async def img(path: str):
    return FileResponse(f"static/img/{path}")

@app.get("/command/{path:path}")
async def command(path: str):
    return FileResponse(f"static/command/{path}")

class SayRequest(BaseModel):
    message: str

@app.post("/api/say")
async def say_message(request: SayRequest):
    """接收控制台消息并记录到日志"""
    message = request.message
    log_event(f"[控制台] {message}", "INFO")
    return {"ok": True, "message": f"消息已记录: {message}"}

if __name__ == "__main__":
    import uvicorn
    # 从环境变量读取配置
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
