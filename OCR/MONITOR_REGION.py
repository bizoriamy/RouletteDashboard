import pyautogui
import time

print("将鼠标移到App窗口的左上角，等待3秒...")
time.sleep(3)
x1, y1 = pyautogui.position()
print(f"左上角坐标: ({x1}, {y1})")

print("再将鼠标移到右下角，等待3秒...")
time.sleep(3)
x2, y2 = pyautogui.position()
print(f"右下角坐标: ({x2}, {y2})")

width = x2 - x1
height = y2 - y1
print(f"区域为: ({x1}, {y1}, {width}, {height})")