#!/usr/bin/env python3
"""
Simplified main.py – Pi backend for trash bin status & battery

- Quản lý chỉ 2 key: `bin_status` (HC, VC, TC, RK) và `battery_level`.
- Các key này được ghi vào một file JSON duy nhất (`payload.json`).
- Flask cung cấp endpoint `/payload` để Dashboard đọc dữ liệu realtime.
- Các module khác (UART, sensor…) có thể import `bin_status`, `battery_level`
  và gọi `save_payload()` để cập nhật file ngay khi thay đổi.
"""

import json
import threading
import time
from pathlib import Path
from flask import Flask, jsonify
from flask_cors import CORS
from copy import deepcopy

# -------------------------------------------------
# 1️⃣ Global state – chỉ chứa bin_status & battery_level
# -------------------------------------------------
bin_status = {"HC": False, "VC": False, "TC": False, "RK": False}
# battery_level (%), mặc định 100
battery_level = 100

# Locks để tránh race condition khi các thread khác cập nhật
bin_lock = threading.Lock()
payload_lock = threading.Lock()

# -------------------------------------------------
# 2️⃣ Đường dẫn tới file JSON (payload) và Flask app
# -------------------------------------------------
PAYLOAD_PATH = Path(__file__).parent / "payload.json"
app = Flask(__name__)
CORS(app)

# -------------------------------------------------
# 3️⃣ Flask route – trả về payload hiện tại
# -------------------------------------------------
@app.route("/payload")
def get_payload():
    """Trả về JSON chỉ gồm bin_status và battery_level."""
    if not PAYLOAD_PATH.is_file():
        return jsonify({"error": "Payload chưa được tạo"}), 404
    try:
        with payload_lock:
            data = json.loads(PAYLOAD_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        return jsonify({"error": f"Không đọc payload: {e}"}), 500
    resp = jsonify(data)
    # Ngăn cache để Dashboard luôn nhận giá trị mới
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

# -------------------------------------------------
# 4️⃣ Helper: tạo payload dict và ghi ra file
# -------------------------------------------------
def build_payload() -> dict:
    """Tạo dict chỉ chứa bin_status và battery_level."""
    with bin_lock:
        data = deepcopy(bin_status)
        data["battery"] = battery_level
    return data

def save_payload():
    payload = build_payload()
    with payload_lock:
        PAYLOAD_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

# -------------------------------------------------
# 5️⃣ Background thread – cập nhật payload mỗi 1 giây
# -------------------------------------------------
def payload_updater(stop_event: threading.Event, interval: float = 1.0):
    while not stop_event.is_set():
        save_payload()
        stop_event.wait(interval)

# -------------------------------------------------
# 6️⃣ Hàm tiện ích cho các module khác (UART, sensor…) để cập nhật trạng thái
# -------------------------------------------------
def update_status(new_bins: dict = None, new_battery: int = None):
    """Cập nhật `bin_status` và/hoặc `battery_level`.
    Các module khác chỉ cần import và gọi hàm này.
    """
    global battery_level
    with bin_lock:
        if new_bins:
            for k in bin_status:
                if k in new_bins:
                    bin_status[k] = bool(new_bins[k])
        if new_battery is not None:
            battery_level = int(new_battery)
    # Lưu ngay sau khi cập nhật
    save_payload()

# -------------------------------------------------
# 7️⃣ Khởi chạy Flask + background updater
# -------------------------------------------------
def run_flask():
    app.run(host="0.0.0.0", port=8085, threaded=True, use_reloader=False)

if __name__ == "__main__":
    # Thread Flask (cung cấp endpoint /payload)
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    # Thread background ghi payload mỗi 1s (đảm bảo file luôn đồng bộ)
    stop_event = threading.Event()
    updater_thread = threading.Thread(target=payload_updater, args=(stop_event, 1.0), daemon=True)
    updater_thread.start()

    try:
        # Vòng đời chính – không làm gì, chỉ chờ until KeyboardInterrupt
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[INFO] Dừng chương trình…")
        stop_event.set()
        updater_thread.join()
        # Flask daemon thread sẽ tự kết thúc khi process kết thúc
