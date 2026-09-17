import cv2
import pyautogui
import numpy as np

print("正在截取全屏...")
screenshot = pyautogui.screenshot()
img = np.array(screenshot)
img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

print("请在弹出的窗口中，用鼠标拖拽框选历史条（包含所有数字），然后按 Enter 或空格键确认。")
roi = cv2.selectROI("请框选历史条区域", img, showCrosshair=True)
cv2.destroyAllWindows()

x, y, w, h = roi
print(f"你框选的区域为: ({int(x)}, {int(y)}, {int(w)}, {int(h)})")