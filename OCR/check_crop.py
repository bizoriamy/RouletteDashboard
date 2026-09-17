import pyautogui

# 你手动提供的坐标
region = (1677, 877, 226, 132)

# 截图并保存到当前文件夹
pyautogui.screenshot(region=region).save("crop_test.png")

print("截图已保存为 crop_test.png，请双击打开查看。")