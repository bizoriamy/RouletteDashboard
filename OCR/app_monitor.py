import base64
import io
import re
import time
import json
import sys
import os
from pathlib import Path

import pyautogui
from PIL import Image
from openai import OpenAI

# ============================================================
#  🎯 配置区
# ============================================================
SECRET_FILE = Path(__file__).resolve().parent.parent / "casino-tracker" / ".secrets" / "ocr.env"


def load_secret(name):
    """Read one value from the private OCR environment file."""
    try:
        for line in SECRET_FILE.read_text(encoding="utf-8-sig").splitlines():
            text = line.strip()
            if not text or text.startswith("#") or "=" not in text:
                continue
            key, value = text.split("=", 1)
            if key.strip() == name:
                return value.strip().strip('"').strip("'")
    except OSError as error:
        raise RuntimeError(f"Unable to read private OCR settings: {SECRET_FILE}") from error
    raise RuntimeError(f"{name} was not found in private OCR settings: {SECRET_FILE}")


API_KEY = load_secret("DEEPSEEK_API_KEY")
DEFAULT_REGION = (1660, 900, 450, 70)
UPSCALE = 4
INTERVAL = 2
INDEX_OF_WINNING = 10            # 历史条最左端（第 11 位）
SIGNATURE_LENGTH = 3             # ⭐ 签名使用 3 个连续位置
MAX_RETRIES = 2
RETRY_DELAY = 0.5
CONFIRMATION_DELAY = 1.5

WRITE_TO_FILE = True
OUTPUT_FILE = "winning_number.txt"

HTTP_PUSH_ENABLED = False
HTTP_ENDPOINT = "http://localhost:8080/api/winning_number"
# ============================================================

# --- 读取多桌配置 ---
table_name = sys.argv[1] if len(sys.argv) > 1 else "default"
config_file = f"config_{table_name}.json"

if os.path.exists(config_file):
    with open(config_file, "r") as f:
        config = json.load(f)
        REGION = tuple(config.get("region", DEFAULT_REGION))
    print(f"📂 已加载桌子 '{table_name}' 的区域: {REGION}")
else:
    REGION = DEFAULT_REGION
    print(f"⚠️ 未找到 {config_file}，使用默认区域: {REGION}")
    print("💡 提示：运行 python calibrate.py 来校准新桌子。")

# --- 初始化 OpenAI 客户端 ---
client = OpenAI(api_key=API_KEY, base_url="https://api.deepseek.com")

_error_counter = 0


# ============================================================
#  核心函数
# ============================================================
def capture_region():
    """Capture the configured roulette history strip."""
    return pyautogui.screenshot(region=REGION)


def extract_numbers_from_image(screenshot, retry_count=0):
    """Return all roulette numbers found in an already-captured image."""
    global _error_counter

    try:
        source_image = screenshot
        working_image = screenshot
        if UPSCALE > 1:
            w, h = working_image.size
            working_image = working_image.resize((w * UPSCALE, h * UPSCALE), Image.Resampling.LANCZOS)

        buffered = io.BytesIO()
        working_image.save(buffered, format="PNG")
        base64_image = base64.b64encode(buffered.getvalue()).decode("utf-8")

        response = client.chat.completions.create(
            model="deepseek-v4-flash-vision-exp",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "提取图片中的所有数字，按从左到右的顺序，用空格分隔返回。只返回数字，不要其他任何文字。"},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                    ]
                }
            ],
            temperature=0.0,
        )

        raw_text = response.choices[0].message.content.strip()
        numbers = re.findall(r'\d+', raw_text)

        # 至少需要 (INDEX_OF_WINNING + SIGNATURE_LENGTH) 个数字
        needed = INDEX_OF_WINNING + SIGNATURE_LENGTH
        if len(numbers) < needed:
            if retry_count < MAX_RETRIES:
                time.sleep(RETRY_DELAY)
                return extract_numbers_from_image(source_image, retry_count + 1)
            else:
                if _error_counter % 5 == 0:
                    print(f"⚠️ 重试 {MAX_RETRIES} 次后仍识别不足，实际 {len(numbers)} 个数字（需要 {needed} 个）。")
                _error_counter += 1
                return numbers

        _error_counter = 0
        return numbers

    except Exception as e:
        if retry_count < MAX_RETRIES:
            time.sleep(RETRY_DELAY)
            return extract_numbers_from_image(source_image, retry_count + 1)
        else:
            if _error_counter % 5 == 0:
                print(f"⚠️ API 调用失败（重试 {MAX_RETRIES} 次后）: {e}")
            _error_counter += 1
            return []


def get_full_sequence(retry_count=0):
    """截取历史条，返回识别出的所有数字列表。"""
    global _error_counter
    try:
        return extract_numbers_from_image(capture_region(), retry_count)
    except Exception as e:
        if _error_counter % 5 == 0:
            print(f"⚠️ 屏幕截图失败: {e}")
        _error_counter += 1
        return []


def get_winning_signature():
    """
    ⭐ 返回由 (第11位, 第12位, 第13位) 组成的 3 元组签名。
    历史条最左端为最新号码，依次往后为上一期、上上期。
    """
    numbers = get_full_sequence()
    needed = INDEX_OF_WINNING + SIGNATURE_LENGTH
    if len(numbers) >= needed:
        # 取从 INDEX_OF_WINNING 开始的 SIGNATURE_LENGTH 个数字
        sig = tuple(numbers[INDEX_OF_WINNING : INDEX_OF_WINNING + SIGNATURE_LENGTH])
        return sig
    return None


def notify_external(number):
    """将最新号码发送到外部（文件 / HTTP）。"""
    if WRITE_TO_FILE:
        try:
            with open(OUTPUT_FILE, "w") as f:
                f.write(number)
        except Exception as e:
            print(f"⚠️ 写入文件失败: {e}")

    if HTTP_PUSH_ENABLED:
        try:
            import requests
            resp = requests.post(HTTP_ENDPOINT, json={"number": number}, timeout=2)
            if resp.status_code != 200:
                print(f"⚠️ HTTP 推送失败: {resp.status_code}")
        except Exception as e:
            print(f"⚠️ HTTP 推送异常: {e}")


def monitor_winning_number():
    """
    ⭐ 双读确认 + 3 元签名，过滤过渡读取 + 捕捉重复号码。
    """
    previous_sig = None
    print(f"\n🔍 开始监控最新中奖号码（第 {INDEX_OF_WINNING+1} 位）...")
    print(f"   轮询间隔: {INTERVAL}s | 确认延迟: {CONFIRMATION_DELAY}s | 签名长度: {SIGNATURE_LENGTH}")
    print("   按 Ctrl+C 停止监控。\n")

    try:
        while True:
            current_sig = get_winning_signature()

            if current_sig is None:
                time.sleep(INTERVAL)
                continue

            # 签名变化时进入双读确认流程
            if current_sig != previous_sig:
                time.sleep(CONFIRMATION_DELAY)
                confirm_sig = get_winning_signature()

                if confirm_sig == current_sig:
                    latest = current_sig[0]
                    history = " → ".join(current_sig[1:])
                    timestamp = time.strftime("%H:%M:%S")
                    print(f"[{timestamp}] 🎯 新号码 → {latest}  (之前: {history})")
                    notify_external(latest)
                    previous_sig = current_sig

            time.sleep(INTERVAL)

    except KeyboardInterrupt:
        print("\n🛑 监控已停止。")


# ============================================================
#  程序入口
# ============================================================
if __name__ == "__main__":
    print("\n===== 🎰 轮盘历史号码监控系统 =====\n")
    print("正在进行初始测试...")
    test_numbers = get_full_sequence()
    if test_numbers:
        print(f"✅ 完整序列: {' '.join(test_numbers)}")
        needed = INDEX_OF_WINNING + SIGNATURE_LENGTH
        if len(test_numbers) >= needed:
            sig = test_numbers[INDEX_OF_WINNING : INDEX_OF_WINNING + SIGNATURE_LENGTH]
            print(f"✅ 当前签名 (最新 → 上上期): {' → '.join(sig)}")
            print(f"✅ 最新号码: {sig[0]}")
        else:
            print(f"⚠️ 序列长度不足（需 {needed} 个），请检查区域是否框选正确。")
    else:
        print("❌ 初始测试失败，请检查网络、API Key 或区域设置。")

    print("\n按 Enter 开始循环监控...")
    input()
    monitor_winning_number()
