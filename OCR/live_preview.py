import cv2
import pyautogui
import numpy as np
import time

print("将鼠标移到历史条区域的左上角，按 'q' 键确认")
print("将鼠标移到历史条区域的右下角，按 'q' 键确认")

# 第一次获取左上角
while True:
    x, y = pyautogui.position()
    # 在屏幕上显示一个小窗口显示当前鼠标位置（可选）
    print(f"\r当前鼠标位置: ({x}, {y})", end="")
    if cv2.waitKey(1) & 0xFF == ord('q'):
        top_left = (x, y)
        print(f"\n左上角已锁定: {top_left}")
        break

# 第二次获取右下角
while True:
    x, y = pyautogui.position()
    print(f"\r当前鼠标位置: ({x}, {y})", end="")
    if cv2.waitKey(1) & 0xFF == ord('q'):
        bottom_right = (x, y)
        print(f"\n右下角已锁定: {bottom_right}")
        break

# 计算区域
x1, y1 = top_left
x2, y2 = bottom_right
width = x2 - x1
height = y2 - y1
if width < 0:
    x1, x2 = x2, x1
    width = x2 - x1
if height < 0:
    y1, y2 = y2, y1
    height = y2 - y1

region = (x1, y1, width, height)
print(f"最终区域: {region}")