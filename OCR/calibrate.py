import cv2
import json
import pyautogui
import numpy as np
import os

print("正在截取全屏用于校准...")
screenshot = pyautogui.screenshot()
img = np.array(screenshot)
img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

print("请在弹出的窗口中框选历史条区域，然后按 空格/回车 确认。")
roi = cv2.selectROI("框选历史条", img, showCrosshair=True)
cv2.destroyAllWindows()

x, y, w, h = roi
region = (int(x), int(y), int(w), int(h))

# 输入这张桌子的名字
table_name = input("请为这张桌子起个名字（例如：european, american, auto）：").strip()
if not table_name:
    table_name = "default"

# 保存到 {table_name}_config.json
filename = f"config_{table_name}.json"
with open(filename, "w") as f:
    json.dump({"region": region, "name": table_name}, f)

print(f"✅ 区域已保存到 {filename}: {region}")