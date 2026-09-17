import base64
from pathlib import Path
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

def ocr_from_image(image_path: str) -> str:
    """
    使用 DeepSeek V4 Flash Vision 模型识别图片中的文字。
    """
    client = OpenAI(
        api_key=API_KEY,
        base_url="https://api.deepseek.com"   # DeepSeek 官方 API 地址
    )

    # 读取图片并转成 Base64
    with open(image_path, "rb") as f:
        base64_image = base64.b64encode(f.read()).decode("utf-8")

    # 调用视觉模型
    response = client.chat.completions.create(
        model="deepseek-v4-flash-vision-exp",   # 必须用这个模型 ID
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请提取这张图片中的所有文字，并以纯文本返回。"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{base64_image}"
                        }
                    }
                ]
            }
        ],
        # 可以调整参数，例如温度
        temperature=0.0,
    )

    return response.choices[0].message.content

if __name__ == "__main__":
    # 测试：将 "screenshot.png" 换成你电脑上的任意一张图片路径
    result = ocr_from_image("screenshot.png")
    print("识别结果：")
    print(result)
