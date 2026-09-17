import base64
import io
from pathlib import Path
import pyautogui
from PIL import Image
from openai import OpenAI

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
REGION = (1660, 900, 450, 70)      # 你刚框选的新区域
UPSCALE = 4                        # 放大倍数

client = OpenAI(api_key=API_KEY, base_url="https://api.deepseek.com")

def test_ocr():
    # 1. 截图
    screenshot = pyautogui.screenshot(region=REGION)
    
    # 2. 放大图片（关键步骤）
    if UPSCALE > 1:
        width, height = screenshot.size
        new_size = (width * UPSCALE, height * UPSCALE)
        # 使用高质量重采样算法
        screenshot = screenshot.resize(new_size, Image.Resampling.LANCZOS)
    
    # 3. 转为 Base64
    buffered = io.BytesIO()
    screenshot.save(buffered, format="PNG")
    base64_image = base64.b64encode(buffered.getvalue()).decode("utf-8")
    
    # 4. 调用模型（提示词保持不变）
    response = client.chat.completions.create(
        model="deepseek-v4-flash-vision-exp",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "提取图片中所有数字，按从左到右的顺序，用空格分隔返回。只返回数字。"},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64_image}"}}
                ]
            }
        ],
        temperature=0.0,
    )
    print("识别结果：")
    print(response.choices[0].message.content)

if __name__ == "__main__":
    test_ocr()
