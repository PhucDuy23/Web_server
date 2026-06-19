// ==================== MERGED MAIN.JS (single-file bundle) ====================
// This file combines config, state, charts, utils, firebase, history, sensors,
// control, auth, router, history-page and the main initialization.

// -------- config.js --------
const CONFIG = {
  API_BASE_URL: "http://192.168.1.153:8085",
  WS_URL: "ws://192.168.1.153:8080",
  DEMO_MODE: false,
  CHART_UPDATE_INTERVAL: 1000,
  TRASH_CHECK_INTERVAL: 2000,
  PING_INTERVAL: 3000,
  STATS_UPDATE_INTERVAL: 5000,
  MAX_CHART_POINTS: 30,
  MAX_LOG_ENTRIES: 50,
  NOTIFICATION_DURATION: 3000,
  DEFAULT_SPEED: 50,
  DEFAULT_MODE: "manual",
};

// -------- state.js --------
let appState = {
  isAuthenticated: false,
  currentUser: null,
  currentMode: "manual",
  isMoving: false,
  lastCommand: null,
  trashLevels: {
    inorganic: false,
    organic: false,
    recycle: false,
    other: false,
  },
  statistics: {
    trips: 1245,
    totalTrash: 2847,
    battery: 87,
    temperature: 32,
    detectCounts: { inorganic: 0, organic: 0, recycle: 0, other: 0 },
  },
  wsConnected: false,
  autoSaveSnapshots: true,
  lastSnapshotSavedTs: null,
};

// IMU chart removed

// Load persisted detectCounts if available
try {
  const saved = localStorage.getItem("detectCounts");
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === "object") {
      appState.statistics.detectCounts = {
        inorganic: parsed.inorganic || 0,
        organic: parsed.organic || 0,
        recycle: parsed.recycle || 0,
        other: parsed.other || 0,
      };
    }
  }
} catch (e) {
  console.warn("Could not load detectCounts from localStorage:", e);
}

function persistDetectCounts() {
  try {
    localStorage.setItem(
      "detectCounts",
      JSON.stringify(appState.statistics.detectCounts),
    );
  } catch (e) {
    console.warn("Could not persist detectCounts:", e);
  }
}

function incrementDetectCount(label) {
  if (!label || typeof label !== "string") return;
  const s = label.trim().toLowerCase();
  let key = null;
  if (s.includes("hữu") || s.includes("huu") || s.includes("organic"))
    key = "organic";
  else if (s.includes("vô") || s.includes("vo") || s.includes("inorganic"))
    key = "inorganic";
  else if (s.includes("tái") || s.includes("tai") || s.includes("recycle"))
    key = "recycle";
  else if (s.includes("khác") || s.includes("khac") || s.includes("other"))
    key = "other";
  else {
    // try exact matches
    if (s === "organic" || s === "hc") key = "organic";
    if (s === "inorganic" || s === "vc") key = "inorganic";
    if (s === "recycle" || s === "tc") key = "recycle";
    if (s === "other" || s === "rk") key = "other";
  }
  if (!key) return;
  appState.statistics.detectCounts[key] =
    (appState.statistics.detectCounts[key] || 0) + 1;
  persistDetectCounts();
  // update DOM if present
  const map = {
    inorganic: "statInorganicCount",
    organic: "statOrganicCount",
    recycle: "statRecycleCount",
    other: "statOtherCount",
  };
  const el = document.getElementById(map[key]);
  if (el) el.textContent = String(appState.statistics.detectCounts[key]);
}

// -------- utils.js (no imports) --------
function addCommandLog(message, type = "info") {
  const logContent = document.getElementById("commandLog");
  if (!logContent) return;
  const logEntry = document.createElement("p");
  logEntry.className = "log-entry";
  if (type) logEntry.classList.add(type);
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  logEntry.textContent = `[${timestamp}] ${message}`;
  logContent.insertBefore(logEntry, logContent.firstChild);
  while (logContent.children.length > CONFIG.MAX_LOG_ENTRIES) {
    logContent.removeChild(logContent.lastChild);
  }
}
function clearCommandLog() {
  const logContent = document.getElementById("commandLog");
  if (logContent)
    logContent.innerHTML = '<p class="log-entry">[Nhật ký đã được xóa]</p>';
}
function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("vi-VN");
  const timeElement = document.getElementById("currentTime");
  if (timeElement) {
    const existing = String(timeElement.textContent || "");
    if (existing.includes("Thời")) {
      timeElement.textContent = `Thời gian: ${timeString}`;
    } else {
      timeElement.textContent = timeString;
    }
  }
}
function updatePing() {
  const ping = Math.floor(Math.random() * 50) + 5;
  const pingElement = document.getElementById("pingValue");
  if (pingElement) pingElement.textContent = ping + "ms";
  const pingElAlt = document.getElementById("ping");
  if (pingElAlt) pingElAlt.textContent = `Ping: ${ping} ms`;
}
function updateStatistics() {
  if (CONFIG.DEMO_MODE && appState.isAuthenticated) {
    const tripCountEl = document.getElementById("tripCount");
    if (!tripCountEl) return;
    appState.statistics.trips =
      parseInt(tripCountEl.textContent) + Math.floor(Math.random() * 2);
    appState.statistics.totalTrash += Math.floor(Math.random() * 5);
    appState.statistics.battery -= Math.random() * 0.1;
    document.getElementById("tripCount").textContent =
      appState.statistics.trips.toLocaleString();
    document.getElementById("totalTrash").textContent =
      appState.statistics.totalTrash.toLocaleString() + " kg";
    document.getElementById("batteryLevel").textContent =
      Math.max(0, appState.statistics.battery.toFixed(1)) + "%";
    document.getElementById("temperature").textContent =
      (32 + Math.sin(Date.now() / 5000) * 3).toFixed(1) + "°C";
    // Update trash levels randomly for demo
    const newTrashLevels = {
      inorganic: Math.random() > 0.8,
      organic: Math.random() > 0.8,
      recycle: Math.random() > 0.8,
      other: Math.random() > 0.8,
    };
    updateTrashLevels(
      newTrashLevels.inorganic,
      newTrashLevels.organic,
      newTrashLevels.recycle,
      newTrashLevels.other,
    );
  }
}
function loadUserPreferences() {
  const speedSlider = document.getElementById("speedSlider");
  const modeSelect = document.getElementById("modeSelect");
  if (!speedSlider || !modeSelect) return;
  const savedSpeed = localStorage.getItem("robotSpeed");
  const savedMode = localStorage.getItem("robotMode");
  if (savedSpeed) {
    speedSlider.value = savedSpeed;
    document.getElementById("speedValue").textContent = savedSpeed + "%";
  }
  if (savedMode) modeSelect.value = savedMode;
}
function saveUserPreferences() {
  const speedSlider = document.getElementById("speedSlider");
  const modeSelect = document.getElementById("modeSelect");
  if (!speedSlider || !modeSelect) return;
  localStorage.setItem("robotSpeed", speedSlider.value);
  localStorage.setItem("robotMode", modeSelect.value);
}

// -------- firebase.js (no imports) --------
function updateFirebase(command) {
  if (CONFIG.DEMO_MODE) {
    console.log("📡 [DEMO MODE] Firebase command:", command);
  }
}
function listenToSensors() {
  if (CONFIG.DEMO_MODE) {
    console.log("📡 [DEMO MODE] Listening to sensors...");
  }
}
function sendWebSocketMessage(message) {
  if (CONFIG.DEMO_MODE) {
    console.log("💬 [DEMO MODE] WebSocket:", message);
  }
}

// -------- history.js (no imports) --------
let historyData = {
  trips: [],
  activities: [],
  stats: { totalTrips: 0, totalDistance: 0, totalTrash: 0, totalTime: 0 },
};
function generateDemoHistory() {
  if (localStorage.getItem("historyDemoShown") === "1") return;
  historyData.trips = [
    {
      id: Date.now() + 1,
      startTime: new Date(Date.now() - 1000 * 60 * 30),
      endTime: new Date(Date.now() - 1000 * 60 * 15),
      distance: 3.4,
      trash: 5.8,
      status: "completed",
      mode: "auto",
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toLocaleString("vi-VN"),
      time: new Date(Date.now() - 1000 * 60 * 15).toLocaleTimeString("vi-VN"),
    },
    {
      id: Date.now() + 2,
      startTime: new Date(Date.now() - 1000 * 60 * 60),
      endTime: new Date(Date.now() - 1000 * 60 * 45),
      distance: 2.1,
      trash: 3.2,
      status: "completed",
      mode: "manual",
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toLocaleString("vi-VN"),
      time: new Date(Date.now() - 1000 * 60 * 45).toLocaleTimeString("vi-VN"),
    },
  ];
  historyData.activities = [
    {
      id: Date.now() + 10,
      description: "📤 Lệnh: Bắt đầu thu gom",
      type: "command",
      timestamp: new Date(Date.now() - 1000 * 60 * 40).toLocaleString("vi-VN"),
      time: new Date(Date.now() - 1000 * 60 * 40).toLocaleTimeString("vi-VN"),
    },
    {
      id: Date.now() + 11,
      description: "📌 Sự kiện: Pin còn 72%",
      type: "event",
      timestamp: new Date(Date.now() - 1000 * 60 * 35).toLocaleString("vi-VN"),
      time: new Date(Date.now() - 1000 * 60 * 35).toLocaleTimeString("vi-VN"),
    },
    {
      id: Date.now() + 12,
      description: "⚠️ Cảnh báo: Vùng thu gom cao điểm",
      type: "warning",
      timestamp: new Date(Date.now() - 1000 * 60 * 20).toLocaleString("vi-VN"),
      time: new Date(Date.now() - 1000 * 60 * 20).toLocaleTimeString("vi-VN"),
    },
  ];
  historyData.stats = {
    totalTrips: 2,
    totalDistance: 5.5,
    totalTrash: 9.0,
    totalTime: 2700,
  };
  try {
    localStorage.setItem("historyDemoShown", "1");
  } catch (e) {
    console.warn("Unable to persist demo history flag:", e);
  }
}
function renderHistory() {
  updateActivityDisplay();
  updateStatsDisplay();
}
function initializeHistoryListeners() {
  const toggleControlBtn = document.getElementById("toggleControl");
  const toggleHistoryBtn = document.getElementById("toggleHistory");
  const controlSection = document.getElementById("controlSection");
  const historySection = document.getElementById("historySection");
  if (toggleControlBtn && controlSection) {
    toggleControlBtn.addEventListener("click", () => {
      controlSection.classList.add("active");
      if (historySection) historySection.classList.remove("active");
      toggleControlBtn.classList.add("active");
      if (toggleHistoryBtn) toggleHistoryBtn.classList.remove("active");
    });
  }
  if (toggleHistoryBtn && historySection) {
    toggleHistoryBtn.addEventListener("click", () => {
      historySection.classList.add("active");
      if (controlSection) controlSection.classList.remove("active");
      toggleHistoryBtn.classList.add("active");
      if (toggleControlBtn) toggleControlBtn.classList.remove("active");
    });
  }
  if (
    historyData.trips.length === 0 &&
    historyData.activities.length === 0 &&
    localStorage.getItem("historyDemoShown") !== "1"
  ) {
    generateDemoHistory();
  }
  renderHistory();
  const tabButtons = document.querySelectorAll(".history-tab-btn");
  const historyContents = document.querySelectorAll(".history-content");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabName = button.getAttribute("data-tab");
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      historyContents.forEach((content) => content.classList.remove("active"));
      button.classList.add("active");
      const activeContent = document.getElementById(tabName + "Content");
      if (activeContent) activeContent.classList.add("active");
    });
  });
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");
  const exportHistoryBtn = document.getElementById("exportHistoryBtn");
  if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", clearHistory);
  if (exportHistoryBtn)
    exportHistoryBtn.addEventListener("click", exportHistoryAsCSV);
}
function addActivity(description, type = "command") {
  const activity = {
    id: Date.now(),
    description: description,
    type: type,
    timestamp: new Date().toLocaleString("vi-VN"),
    time: new Date().toLocaleTimeString("vi-VN"),
  };
  historyData.activities.unshift(activity);
  if (historyData.activities.length > 100) historyData.activities.pop();
  updateActivityDisplay();
  console.log("📝 Activity logged:", activity);
}
// trip-related UI removed: addTrip and updateTripDisplay functions deleted
function updateActivityDisplay() {
  const activitiesList = document.getElementById("activitiesList");
  if (!activitiesList) return;
  if (historyData.activities.length === 0) {
    activitiesList.innerHTML = `<div class="history-demo-card"> <div class="history-demo-title">Chưa có hoạt động ghi nhận</div> <p class="history-demo-text">Mọi lệnh, thông báo và cảnh báo sẽ xuất hiện tại đây sau khi robot hoạt động.</p> <div class="history-item command"> <div class="history-item-header"> <span class="history-item-title">📤 Lệnh: Thu gom tự động</span> <span class="history-item-time">09:14</span> </div> </div> <div class="history-item event"> <div class="history-item-header"> <span class="history-item-title">📌 Sự kiện: Pin còn 72%</span> <span class="history-item-time">09:20</span> </div> </div> <div class="history-demo-note">Dữ liệu mẫu sẽ được cập nhật sau khi hệ thống chạy thực tế.</div> </div>`;
    return;
  }
  activitiesList.innerHTML = historyData.activities
    .map(
      (activity) =>
        `<div class="history-item ${activity.type}"> <div class="history-item-header"> <span class="history-item-title"> ${getActivityIcon(activity.type)} ${activity.description} </span> <span class="history-item-time">${activity.time}</span> </div> </div>`,
    )
    .join("");
}
function updateStatsDisplay() {
  const statsGrid = document.querySelector(".stats-grid");
  if (!statsGrid) return;

  // show demo note if no trips
  if (historyData.stats.totalTrips === 0) {
    // set placeholders for any of the old stats if they exist
    const tEl = document.getElementById("statTotalTrips");
    if (tEl) tEl.textContent = "—";
    const dEl = document.getElementById("statTotalDistance");
    if (dEl) dEl.textContent = "—";
    const trashEl = document.getElementById("statTotalTrash");
    if (trashEl) trashEl.textContent = "—";
    const batteryRt = document.getElementById("batteryRuntime");
    if (batteryRt) batteryRt.textContent = "—";

    if (!statsGrid.querySelector(".history-demo-note")) {
      statsGrid.insertAdjacentHTML(
        "beforeend",
        '<div class="history-demo-note stats-note">Dữ liệu thực tế chưa có. Đây là vùng thống kê mẫu.</div>',
      );
    }
  } else {
    const demoNote = statsGrid.querySelector(".history-demo-note.stats-note");
    if (demoNote) demoNote.remove();

    const tEl = document.getElementById("statTotalTrips");
    if (tEl) tEl.textContent = historyData.stats.totalTrips;
    const dEl = document.getElementById("statTotalDistance");
    if (dEl)
      dEl.textContent = historyData.stats.totalDistance.toFixed(2) + " km";
    const trashEl = document.getElementById("statTotalTrash");
    if (trashEl)
      trashEl.textContent = historyData.stats.totalTrash.toFixed(1) + " kg";
    // total runtime removed from history page; dashboard battery shows runtime
    // update dashboard battery runtime display if present
    const batteryRt = document.getElementById("batteryRuntime");
    if (batteryRt) {
      const totalSeconds = historyData.stats.totalTime || 0;
      const hrs = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      batteryRt.textContent = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }
  }

  // update detection counts (if elements exist)
  const counts = appState.statistics.detectCounts || {
    inorganic: 0,
    organic: 0,
    recycle: 0,
    other: 0,
  };
  const elIn = document.getElementById("statInorganicCount");
  if (elIn) elIn.textContent = String(counts.inorganic || 0);
  const elOr = document.getElementById("statOrganicCount");
  if (elOr) elOr.textContent = String(counts.organic || 0);
  const elRe = document.getElementById("statRecycleCount");
  if (elRe) elRe.textContent = String(counts.recycle || 0);
  const elOt = document.getElementById("statOtherCount");
  if (elOt) elOt.textContent = String(counts.other || 0);
}
function getActivityIcon(type) {
  const icons = {
    command: "📤",
    event: "📌",
    warning: "⚠️",
    error: "❌",
    success: "✅",
  };
  return icons[type] || "📝";
}
function getDuration(startTime, endTime) {
  const diff = new Date(endTime) - new Date(startTime);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  else if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  else return `${seconds}s`;
}
function clearHistory() {
  if (confirm("⚠️ Xóa tất cả lịch sử? Thao tác này không thể hoàn tác!")) {
    historyData.trips = [];
    historyData.activities = [];
    historyData.stats = {
      totalTrips: 0,
      totalDistance: 0,
      totalTrash: 0,
      totalTime: 0,
    };
    // trips UI removed; refresh activities and stats only
    updateActivityDisplay();
    updateStatsDisplay();
    console.log("🗑️ History cleared");
  }
}
function exportHistoryAsCSV() {
  let csv =
    "Chuyến Đi,Khoảng Cách (km),Rác Thu Gom (kg),Thời Lượng,Trạng Thái\n";
  historyData.trips.forEach((trip) => {
    csv += `${trip.timestamp},${trip.distance.toFixed(2)},${trip.trash.toFixed(1)},${getDuration(trip.startTime, trip.endTime)},${trip.status}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `history-${new Date().getTime()}.csv`;
  a.click();
  console.log("📥 History exported");
}

function formatDateSegment(date = new Date()) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = String(date.getFullYear()).slice(-2);
  return `${d}${m}${y}`;
}

function sanitizeLabel(label) {
  return String(label || "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function getHistoryFolder(date = new Date()) {
  return `History_${formatDateSegment(date)}`;
}

function getSnapshotFilename(label, date = new Date()) {
  const timestamp = `${String(date.getHours()).padStart(2, "0")}${String(
    date.getMinutes(),
  ).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  return `${sanitizeLabel(label)}_${formatDateSegment(date)}_${timestamp}.png`;
}

function getAllTrips() {
  return historyData.trips;
}
function getAllActivities() {
  return historyData.activities;
}
function getStatistics() {
  return historyData.stats;
}

// -------- Flask Camera Server AI Updates --------
function updateWebSnapshot() {
  if (!appState.isAuthenticated) return; // Chỉ chạy khi đã đăng nhập thành công

  fetch(`${CONFIG.API_BASE_URL}/latest_info`)
    .then((response) => {
      if (response.ok) return response.json();
      throw new Error("Không phản hồi");
    })
    .then((data) => {
      const snapshotImg = document.getElementById("snapshotView");
      const placeholder = document.getElementById("streamPlaceholder");
      const metaDiv = document.getElementById("snapshotMeta");
      const statusText = document.getElementById("cameraStatusText");
      const statusDot = document.getElementById("cameraStatusDot");

      if (data.available) {
        // Cập nhật Badge trạng thái sang xanh (Xử lý xong)
        if (statusText) statusText.innerText = "DONE";
        if (statusDot) statusDot.style.backgroundColor = "#2ecc71";

        // Hiển thị ảnh kèm ts chống cache trùng khớp với các ID trong index.html
        if (snapshotImg) {
          snapshotImg.src = `${CONFIG.API_BASE_URL}/latest.jpg?ts=${data.ts}`;
          snapshotImg.style.display = "block";
        }
        if (placeholder) placeholder.style.display = "none";

        // Hiển thị text Nhãn kết quả đè lên góc ảnh
        if (metaDiv) {
          metaDiv.innerText = `Kết quả: ${data.label}`;
          metaDiv.style.display = "block";
        }

        // Tự động lưu ảnh nếu được bật và nếu ảnh mới
        if (
          appState.autoSaveSnapshots &&
          data.ts &&
          data.ts !== appState.lastSnapshotSavedTs &&
          snapshotImg &&
          snapshotImg.src
        ) {
          appState.lastSnapshotSavedTs = data.ts;
          try {
            incrementDetectCount(data.label || "unknown");
          } catch (e) {
            console.warn("Could not increment detect count:", e);
          }
          saveSnapshotImage(data.label || "unknown", snapshotImg.src, data.ts);
        }
      } else {
        // Trả về trạng thái chờ ban đầu nếu chưa có ảnh rác mới
        if (statusText) statusText.innerText = "WAITING";
        if (statusDot) statusDot.style.backgroundColor = "#f1c40f";
      }
    })
    .catch((err) => {
      // Trường hợp mất kết nối hoặc Flask camera server chưa chạy
      const statusText = document.getElementById("cameraStatusText");
      const statusDot = document.getElementById("cameraStatusDot");
      if (statusText) statusText.innerText = "OFFLINE";
      if (statusDot) statusDot.style.backgroundColor = "#e74c3c";
    });
}

// Lấy trạng thái thùng rác từ Flask Pi và cập nhật giao diện
function updateWebBinsStatus() {
  if (!appState.isAuthenticated) return;
  const runtimePi =
    (typeof localStorage !== "undefined" &&
      localStorage.getItem("PI_CAMERA_URL")) ||
    null;
  const base = (
    runtimePi ||
    CONFIG.PI_CAMERA_URL ||
    CONFIG.API_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  const fetchUrl = base ? `${base}/bins_status` : null;
  if (!fetchUrl) return;

  function parseBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (v == null) return false;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      return s === "true" || s === "1" || s === "on" || s === "yes";
    }
    return Boolean(v);
  }

  fetch(fetchUrl + `?t=${Date.now()}`, { cache: "no-store" })
    .then((res) => {
      if (res.ok) return res.json();
      throw new Error("HTTP " + res.status);
    })
    .then((status) => {
      console.log("Trạng thái thùng từ Pi:", status);
      // Cập nhật giao diện chính
      updateTrashLevels(status);

      // Áp hiệu ứng cảnh báo lên DOM tương ứng
      const vals = {
        inorganic: parseBool(status.VC),
        organic: parseBool(status.HC),
        recycle: parseBool(status.TC),
        other: parseBool(status.RK),
      };
      const map = {
        inorganic: "inorganic-fill",
        organic: "organic-fill",
        recycle: "recycle-fill",
        other: "other-fill",
      };
      Object.keys(vals).forEach((k) => {
        const el = document.getElementById(map[k]);
        if (!el) return;
        if (vals[k]) {
          el.style.boxShadow = "0 10px 24px rgba(255,71,87,0.12)";
          el.style.borderColor = "rgba(255,71,87,0.5)";
        } else {
          el.style.boxShadow = "";
          el.style.borderColor = "transparent";
        }
      });
    })
    .catch((err) => {
      console.warn("Cannot fetch bins_status from Pi:", err);
    });
}

// IMU sensor handling removed
function updateTrashLevels(a, b, c, d) {
  // Flexible updater: accepts either (inorganic, organic, recycle, other)
  // or a single object returned from Pi API with keys HC, VC, TC, RK
  let inorganic, organic, recycle, other;

  if (typeof a === "object" && a !== null && !Array.isArray(a)) {
    const data = a;
    const norm = (v) => {
      if (v === true) return true;
      if (v === false) return false;
      if (v == null) return false;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string")
        return ["true", "1", "on", "yes"].includes(v.trim().toLowerCase());
      return Boolean(v);
    };
    // API keys (HC/VC/TC/RK) map to organic/inorganic/recycle/other
    organic = norm(data.HC ?? data.organic);
    inorganic = norm(data.VC ?? data.inorganic);
    recycle = norm(data.TC ?? data.recycle);
    other = norm(data.RK ?? data.other);
  } else {
    inorganic = !!a;
    organic = !!b;
    recycle = !!c;
    other = !!d;
  }

  appState.trashLevels = { inorganic, organic, recycle, other };

  const levels = [
    { id: "inorganic-fill", value: inorganic, label: "Vô Cơ" },
    { id: "organic-fill", value: organic, label: "Hữu Cơ" },
    { id: "recycle-fill", value: recycle, label: "Tái Chế" },
    { id: "other-fill", value: other, label: "Khác" },
  ];

  const imageMap = {
    "inorganic-fill": { empty: "images/VC_0.png", full: "images/VC_100.png" },
    "organic-fill": { empty: "images/HC_0.png", full: "images/HC_100.png" },
    "recycle-fill": { empty: "images/TC_0.png", full: "images/TC_100.png" },
    "other-fill": { empty: "images/K_0.png", full: "images/K_100.png" },
  };

  levels.forEach((level) => {
    const element = document.getElementById(level.id);
    if (element) {
      const icon = element.querySelector(".trash-icon");
      const isFull = Boolean(level.value);
      if (isFull) {
        element.classList.add("full");
        element.classList.remove("available");
        if (icon && imageMap[level.id]) icon.src = imageMap[level.id].full;
        addCommandLog(`⚠️ ${level.label} đã đầy!`, "warning");
        const statusText = element.querySelector(".status-text");
        if (statusText) statusText.innerText = "ĐẦY";
      } else {
        element.classList.remove("full");
        element.classList.add("available");
        if (icon && imageMap[level.id]) icon.src = imageMap[level.id].empty;
        const statusText = element.querySelector(".status-text");
        if (statusText) statusText.innerText = "CÒN TRỐNG";
      }
    }
  });
}
function updateBatteryStatus(percentage) {
  appState.statistics.battery = percentage;
  const batteryElement = document.getElementById("batteryLevel");
  if (batteryElement) batteryElement.textContent = percentage + "%";

  const batteryFill = document.getElementById("batteryFill");
  if (batteryFill) {
    const pct = Math.max(0, Math.min(100, Math.round(percentage)));
    batteryFill.style.width = pct + "%";
    batteryFill.classList.remove("low", "medium", "high");
    if (pct < 20) batteryFill.classList.add("low");
    else if (pct < 50) batteryFill.classList.add("medium");
    else batteryFill.classList.add("high");
  }

  const statusText = document.getElementById("batteryStatusText");
  if (statusText) {
    if (percentage < 20) statusText.textContent = "Yếu";
    else if (percentage < 50) statusText.textContent = "Thấp";
    else statusText.textContent = "Ổn";
  }

  if (percentage < 20) addCommandLog(`🔋 Pin yếu! (${percentage}%)`, "warning");
}
function updateRobotSpeed(speed) {
  if (CONFIG.DEMO_MODE) {
    console.log("⚡ [DEMO MODE] Robot speed:", speed + "%");
  }
}
function handleModeChange(mode) {
  appState.currentMode = mode;
  const modeLabels = {
    auto: "🤖 Tự Động",
    manual: "🎮 Thủ Công",
    idle: "😴 Chờ",
  };
  addCommandLog(`🔄 Chế độ: ${modeLabels[mode]}`, "command");
  updateFirebase("MODE_CHANGE_" + mode.toUpperCase());
}
function setupModeSelector() {
  const modeSelect = document.getElementById("modeSelect");
  if (modeSelect)
    modeSelect.addEventListener("change", (e) => {
      handleModeChange(e.target.value);
    });
}

// -------- control.js (after sensors) --------
function setupJoypadControls() {
  const joypadButtons = document.querySelectorAll(".joypad-btn");
  joypadButtons.forEach((button) => {
    const command = button.getAttribute("data-command");
    button.addEventListener("mousedown", (e) => {
      e.preventDefault();
      button.classList.add("active");
      if (command != "STOP") sendCommand(command);
    });
    button.addEventListener("mouseup", (e) => {
      e.preventDefault();
      button.classList.remove("active");
      if (command != "STOP") sendCommand("STOP");
    });
    button.addEventListener("mouseleave", () => {
      button.classList.remove("active");
      if (command != "STOP") sendCommand("STOP");
    });
    button.addEventListener("touchstart", (e) => {
      e.preventDefault();
      button.classList.add("active");
      if (command != "STOP") sendCommand(command);
    });
    button.addEventListener("touchend", (e) => {
      e.preventDefault();
      button.classList.remove("active");
      if (command != "STOP") sendCommand("STOP");
    });
    if (command === "STOP") {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        sendCommand("STOP");
        addCommandLog("⏹️ DỪNG NGAY LẬP TỨC", "warning");
      });
    }
  });
}
function sendCommand(command) {
  if (!appState.isAuthenticated) return;
  appState.lastCommand = command;
  const timestamp = new Date().toLocaleTimeString("vi-VN");
  const emoji = {
    FORWARD: "⬆️",
    BACKWARD: "⬇️",
    LEFT: "⬅️",
    RIGHT: "➡️",
    STOP: "⏹️",
    COLLECT: "🗑️",
    HOME: "🏠",
  };
  addCommandLog(
    `${emoji[command] || "📤"} ${command} [${timestamp}]`,
    "command",
  );
  addActivity(`${emoji[command] || "📤"} ${command}`, "command");
  updateFirebase(command);
  if (appState.wsConnected) {
    sendWebSocketMessage({
      type: "COMMAND",
      data: {
        command: command,
        timestamp: Date.now(),
        speed: document.getElementById("speedSlider")?.value || 50,
      },
    });
  }
  console.log("📤 Command sent:", command);
}
function setupSpeedControl() {
  const speedSlider = document.getElementById("speedSlider");
  if (speedSlider)
    speedSlider.addEventListener("input", (e) => {
      document.getElementById("speedValue").textContent = e.target.value + "%";
      updateRobotSpeed(e.target.value);
    });
}
function setupFunctionButtons() {
  const collectBtn = document.getElementById("btnCollect");
  const homeBtn = document.getElementById("btnHome");
  if (collectBtn)
    collectBtn.addEventListener("click", () => sendCommand("COLLECT"));
  if (homeBtn) homeBtn.addEventListener("click", () => sendCommand("HOME"));
}

// -------- auth.js (no imports) --------
function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  if (username === "admin" && password === "12345") {
    authenticateUser(username);
  } else {
    showNotification("❌ Sai tài khoản hoặc mật khẩu!", "error");
    document.getElementById("password").value = "";
  }
}
function authenticateUser(username) {
  appState.isAuthenticated = true;
  appState.currentUser = username;
  const loginOverlay = document.getElementById("loginOverlay");
  if (loginOverlay) loginOverlay.classList.add("hidden");
  const userNameEl = document.getElementById("userName");
  if (userNameEl) userNameEl.textContent = username;
  // Ensure logout button is visible on any page after login
  initializeHistoryListeners();
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.style.display = "inline-flex";
    logoutBtn.innerHTML = `<img src="images/icon_logout.png" class="inline-icon icon-logout" alt="Logout"/> Đăng Xuất (${username})`;
  }
  // Persist session for this browser tab so navigation between pages keeps the session
  try {
    sessionStorage.setItem("isAuthenticated", "1");
    sessionStorage.setItem("currentUser", username);
  } catch (e) {
    console.warn("Could not persist session state:", e);
  }
  if (document.getElementById("commandLog")) {
    addCommandLog("✅ Đăng nhập thành công!", "success");
  }
  addActivity(`👤 Đăng nhập: ${username}`, "event");
  console.log("✅ User authenticated:", username);
  connectToBackend();
}
function handleLogout() {
  if (confirm("⚠️ Bạn chắc chắn muốn đăng xuất?")) {
    appState.isAuthenticated = false;
    appState.currentUser = null;
    const loginOverlay = document.getElementById("loginOverlay");
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.reset();
    try {
      sessionStorage.removeItem("isAuthenticated");
      sessionStorage.removeItem("currentUser");
    } catch (e) {
      console.warn("Could not clear session state:", e);
    }
    // Hide logout button immediately on logout so menu updates
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.style.display = "none";
    if (document.getElementById("commandLog")) {
      addCommandLog("🚪 Đã đăng xuất", "warning");
    }
    addActivity("🚪 Đã đăng xuất", "event");
    console.log("🚪 User logged out");
  }
}
function connectToBackend() {
  if (CONFIG.DEMO_MODE) {
    console.log("🔌 [DEMO MODE] Connecting to backend...");
    if (document.getElementById("commandLog")) {
      addCommandLog("🟢 Kết nối hệ thống thành công", "success");
    }
    appState.wsConnected = true;
    setConnectionStatus(true);
    listenToSensors();
  }
}

function setConnectionStatus(connected) {
  appState.wsConnected = Boolean(connected);
  const el = document.getElementById("firebaseStatus");
  if (!el) return;
  el.classList.remove("connected", "disconnected");
  if (connected) {
    el.classList.add("connected");
    el.textContent = "Connected";
  } else {
    el.classList.add("disconnected");
    el.textContent = "Disconnected";
  }
}
function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 12px 16px; background: ${type === "error" ? "#ff4757" : "#51cf66"}; color: white; border-radius: 4px; font-size: 14px; z-index: 9999; animation: slideInRight 0.3s ease-out;`;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = "slideOutRight 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// -------- router.js (no exports) --------
const PAGES = { DASHBOARD: "dashboard", HISTORY: "history" };
function getCurrentPage() {
  return localStorage.getItem("currentPage") || PAGES.DASHBOARD;
}
function setCurrentPage(page) {
  localStorage.setItem("currentPage", page);
}
function navigateTo(page) {
  setCurrentPage(page);
  // compute target path
  const target = page === PAGES.HISTORY ? "history.html" : "index.html";
  // if we're already on the target, do nothing (prevents reload loops)
  const currentPath = window.location.pathname.split("/").pop();
  if (currentPath === target) {
    console.log(`➡️ Already on ${target}, skipping navigation`);
    return;
  }
  console.log(`➡️ Navigating to ${target}`);
  window.location.href = target;
}
function goBack() {
  const currentPage = getCurrentPage();
  if (currentPage === PAGES.HISTORY) navigateTo(PAGES.DASHBOARD);
  else navigateTo(PAGES.HISTORY);
}

// -------- history-page.js (no imports) --------
document.addEventListener("DOMContentLoaded", () => {
  const historyPageElement = document.getElementById("historyPage");
  if (!historyPageElement) return;
  setCurrentPage(PAGES.HISTORY);
  const loginForm = document.getElementById("loginForm");
  const loginOverlay = document.getElementById("loginOverlay");
  const logoutBtn = document.getElementById("logoutBtn");
  const userNameEl = document.getElementById("userName");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  // restore session from sessionStorage (persists for the tab/session)
  const savedAuth = sessionStorage.getItem("isAuthenticated") === "1";
  if (savedAuth) {
    appState.isAuthenticated = true;
    appState.currentUser = localStorage.getItem("currentUser") || "Admin";
    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (logoutBtn) logoutBtn.style.display = "inline-flex";
    if (userNameEl) userNameEl.textContent = appState.currentUser;
    initializeHistoryListeners();
  } else {
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userNameEl) userNameEl.textContent = "Khách";
  }
  historyPageElement.style.visibility = "visible";
  const backBtn = document.getElementById("backToDashboardBtn");
  if (backBtn)
    backBtn.addEventListener("click", () => {
      navigateTo("dashboard");
    });
  // Change header nav button into a 'Back to Dashboard' on history page
  const headerNavBtn = document.getElementById("historyNavBtn");
  if (headerNavBtn) {
    headerNavBtn.innerHTML =
      '<img src="images/icon_dashboard.png" class="inline-icon ctrl-icon" alt="History"/> Quay lại Dashboard';
    headerNavBtn.title = "Quay lại Dashboard";
    headerNavBtn.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo("dashboard");
    });
  }
  if (logoutBtn)
    logoutBtn.addEventListener("click", () => {
      handleLogout();
      navigateTo("dashboard");
    });
  // Wire header menu (hamburger) and theme toggle on history page
  const headerMenuBtn = document.getElementById("headerMenuBtn");
  const headerMenu = document.getElementById("headerMenu");
  if (headerMenuBtn && headerMenu) {
    headerMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = headerMenu.classList.toggle("open");
      headerMenu.setAttribute("aria-hidden", !open);
    });
    document.addEventListener("click", (e) => {
      if (!headerMenu.contains(e.target) && !headerMenuBtn.contains(e.target)) {
        headerMenu.classList.remove("open");
        headerMenu.setAttribute("aria-hidden", "true");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        headerMenu.classList.remove("open");
        headerMenu.setAttribute("aria-hidden", "true");
      }
    });
  }
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-theme");
      try {
        localStorage.setItem("theme", isLight ? "light" : "dark");
      } catch (e) {
        console.warn("Could not persist theme:", e);
      }
    });
  }
  // Ensure periodic updates run on history page as well
  try {
    updateCurrentTime();
    updatePing();
    startAutoUpdates();
  } catch (e) {
    console.warn("Could not start auto updates on history page:", e);
  }
});

// -------- Original main.js initialization adapted (no imports) --------
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Dashboard initialized");
  // restore session from sessionStorage (persists for the tab/session)
  const savedAuth = sessionStorage.getItem("isAuthenticated") === "1";
  // theme restore: apply saved theme (localStorage) if present
  try {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") document.body.classList.add("light-theme");
  } catch (e) {
    console.warn("Could not read theme setting:", e);
  }
  const currentPage = getCurrentPage();
  if (currentPage === PAGES.HISTORY) {
    navigateTo(PAGES.HISTORY);
    return;
  }
  setCurrentPage(PAGES.DASHBOARD);
  // Initialize connection badge based on current state
  setConnectionStatus(appState.wsConnected);
  const loginOverlay = document.getElementById("loginOverlay");
  const logoutBtn = document.getElementById("logoutBtn");
  const userNameEl = document.getElementById("userName");
  if (savedAuth) {
    appState.isAuthenticated = true;
    appState.currentUser = localStorage.getItem("currentUser") || "Admin";
    if (loginOverlay) loginOverlay.classList.add("hidden");
    // username display moved into logout menu; do not set visible header text
    if (logoutBtn) {
      logoutBtn.style.display = "inline-flex";
      logoutBtn.innerHTML = `<img src="images/icon_logout.png" class="inline-icon icon-logout" alt="Logout"/> Đăng Xuất (${appState.currentUser})`;
    }
  } else {
    // ensure login overlay is visible and header shows guest state
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (logoutBtn) logoutBtn.style.display = "none";
    // keep header userName empty when not authenticated
  }
  // Header nav button on dashboard: open history
  const headerNavBtn = document.getElementById("historyNavBtn");
  if (headerNavBtn) {
    headerNavBtn.innerHTML =
      '<img src="images/icon_history.png" class="inline-icon ctrl-icon" alt="History"/> Lịch Sử';
    headerNavBtn.title = "Mở trang Lịch Sử";
    headerNavBtn.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(PAGES.HISTORY);
    });
  }
  initializeEventListeners();
  loadSavedSnapshotDirectoryHandle().then(updateSnapshotFolderLabel);
  initializeHistoryListeners();
  updateTrashLevels(
    appState.trashLevels.inorganic,
    appState.trashLevels.organic,
    appState.trashLevels.recycle,
    appState.trashLevels.other,
  );
  startAutoUpdates();
  loadUserPreferences();
  // Poll Raspberry Pi HTTP endpoint for bin status (replaces Firebase)
  (function setupPiBinsPolling() {
    let piBinsInterval = null;
    const runtimePi =
      (typeof localStorage !== "undefined" &&
        localStorage.getItem("PI_CAMERA_URL")) ||
      null;
    const base = (
      runtimePi ||
      CONFIG.PI_CAMERA_URL ||
      CONFIG.API_BASE_URL ||
      ""
    ).replace(/\/$/, "");
    const fetchUrl = base ? `${base}/bins_status` : null;
    if (!fetchUrl) {
      console.warn(
        "Pi bins polling disabled: no PI_CAMERA_URL or API_BASE_URL configured",
      );
      window.__piBinsPolling = { stop: () => {} };
      return;
    }

    function parseBool(v) {
      if (v === true) return true;
      if (v === false) return false;
      if (v == null) return false;
      if (typeof v === "number") return v !== 0;
      if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        return s === "true" || s === "1" || s === "on" || s === "yes";
      }
      return Boolean(v);
    }

    async function fetchBinsOnce() {
      try {
        const res = await fetch(fetchUrl + `?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const status = await res.json();
        console.log("Trạng thái thùng từ Pi:", status);
        // mark connection as active when Pi responds
        try {
          setConnectionStatus(true);
        } catch (e) {
          console.warn("Could not update connection status badge:", e);
        }
        // updateTrashLevels can accept the raw status object (HC/VC/TC/RK)
        updateTrashLevels(status);

        // 🔥 BỔ SUNG: nếu Pi trả về phần trăm pin thì cập nhật UI pin
        try {
          if (status && typeof status.battery !== "undefined") {
            const b = parseInt(status.battery, 10);
            if (!Number.isNaN(b)) updateBatteryStatus(b);
          }
        } catch (e) {
          console.warn("Could not update battery status from Pi payload:", e);
        }

        // apply simple visual warning (red tint) to bin containers
        const map = {
          inorganic: "inorganic-fill",
          organic: "organic-fill",
          recycle: "recycle-fill",
          other: "other-fill",
        };
        const vals = {
          inorganic: parseBool(status.VC),
          organic: parseBool(status.HC),
          recycle: parseBool(status.TC),
          other: parseBool(status.RK),
        };
        Object.keys(vals).forEach((k) => {
          const el = document.getElementById(map[k]);
          if (!el) return;
          if (vals[k]) {
            el.style.boxShadow = "0 10px 24px rgba(255,71,87,0.12)";
            el.style.borderColor = "rgba(255,71,87,0.5)";
          } else {
            el.style.boxShadow = "";
            el.style.borderColor = "transparent";
          }
        });
      } catch (err) {
        console.warn("Cannot fetch bins_status from Pi:", err);
        try {
          setConnectionStatus(false);
        } catch (e) {
          console.warn("Could not update connection status badge:", e);
        }
      }
    }

    // start polling (interval from config)
    fetchBinsOnce();
    piBinsInterval = setInterval(
      fetchBinsOnce,
      CONFIG.TRASH_CHECK_INTERVAL || 2000,
    );

    // expose for debugging and cleanup
    window.__piBinsPolling = {
      stop: () => {
        if (piBinsInterval) clearInterval(piBinsInterval);
        piBinsInterval = null;
      },
    };
  })();
  // wire theme toggle button
  const themeToggleBtn = document.getElementById("themeToggleBtn");
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-theme");
      try {
        localStorage.setItem("theme", isLight ? "light" : "dark");
      } catch (e) {
        console.warn("Could not persist theme:", e);
      }
    });
  }
  // Header menu (hamburger) behavior
  const headerMenuBtn = document.getElementById("headerMenuBtn");
  const headerMenu = document.getElementById("headerMenu");
  if (headerMenuBtn && headerMenu) {
    headerMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = headerMenu.classList.toggle("open");
      headerMenu.setAttribute("aria-hidden", !open);
    });
    // close when clicking outside
    document.addEventListener("click", (e) => {
      if (!headerMenu.contains(e.target) && !headerMenuBtn.contains(e.target)) {
        headerMenu.classList.remove("open");
        headerMenu.setAttribute("aria-hidden", "true");
      }
    });
    // close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        headerMenu.classList.remove("open");
        headerMenu.setAttribute("aria-hidden", "true");
      }
    });
  }
});

function initializeEventListeners() {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  const historyNavBtn = document.getElementById("historyNavBtn");
  if (historyNavBtn)
    historyNavBtn.addEventListener("click", () => {
      navigateTo("history");
    });

  const saveSnapshotBtn = document.getElementById("saveSnapshotBtn");
  if (saveSnapshotBtn) {
    saveSnapshotBtn.addEventListener("click", async () => {
      const snapshotImg = document.getElementById("snapshotView");
      const label =
        document.getElementById("cameraStatusText")?.innerText || "unknown";
      if (snapshotImg && snapshotImg.src) {
        if (!snapshotDirectoryHandle && window.showDirectoryPicker) {
          await chooseSnapshotDirectory();
          updateSnapshotFolderLabel();
        }
        saveSnapshotImage(label, snapshotImg.src, Date.now(), true);
      }
    });
  }

  const chooseSaveFolderBtn = document.getElementById("chooseSaveFolderBtn");
  if (chooseSaveFolderBtn) {
    chooseSaveFolderBtn.addEventListener("click", async () => {
      await chooseSnapshotDirectory();
      updateSnapshotFolderLabel();
    });
  }

  const autoSaveToggleBtn = document.getElementById("autoSaveToggleBtn");
  if (autoSaveToggleBtn) {
    autoSaveToggleBtn.addEventListener("click", async () => {
      appState.autoSaveSnapshots = !appState.autoSaveSnapshots;
      localStorage.setItem(
        "autoSaveSnapshots",
        appState.autoSaveSnapshots ? "1" : "0",
      );
      if (
        appState.autoSaveSnapshots &&
        !snapshotDirectoryHandle &&
        window.showDirectoryPicker
      ) {
        const handle = await chooseSnapshotDirectory();
        if (!handle) {
          showNotification(
            "Vui lòng chọn thư mục Pictures để bật auto-save.",
            "warning",
          );
        }
      }
      updateSnapshotSaveControls();
      updateSnapshotFolderLabel();
    });
    const storedAutoSave = localStorage.getItem("autoSaveSnapshots");
    if (storedAutoSave !== null) {
      appState.autoSaveSnapshots = storedAutoSave === "1";
    }
    updateSnapshotSaveControls();
    updateSnapshotFolderLabel();
  }

  setupJoypadControls();
  setupSpeedControl();
  setupModeSelector();
  setupFunctionButtons();
  const clearLogBtn = document.getElementById("clearLogBtn");
  if (clearLogBtn) clearLogBtn.addEventListener("click", clearCommandLog);
}

const SNAPSHOT_HANDLE_DB_NAME = "snapshot-directory-store";
const SNAPSHOT_HANDLE_DB_VERSION = 1;
const SNAPSHOT_HANDLE_STORE = "handles";
const SNAPSHOT_HANDLE_KEY = "snapshotDirectory";

let snapshotDirectoryHandle = null;
let snapshotDirectoryRequestedOnce = false;

function openSnapshotHandleDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Trình duyệt không hỗ trợ IndexedDB."));
      return;
    }
    const request = indexedDB.open(
      SNAPSHOT_HANDLE_DB_NAME,
      SNAPSHOT_HANDLE_DB_VERSION,
    );
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_HANDLE_STORE)) {
        db.createObjectStore(SNAPSHOT_HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSnapshotDirectoryHandleToDB(handle) {
  try {
    const db = await openSnapshotHandleDB();
    const tx = db.transaction(SNAPSHOT_HANDLE_STORE, "readwrite");
    tx.objectStore(SNAPSHOT_HANDLE_STORE).put(handle, SNAPSHOT_HANDLE_KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("Không lưu được thư mục lưu vào IndexedDB:", error);
  }
}

async function loadSavedSnapshotDirectoryHandle() {
  if (!window.indexedDB || !window.showDirectoryPicker) return null;
  try {
    const db = await openSnapshotHandleDB();
    const tx = db.transaction(SNAPSHOT_HANDLE_STORE, "readonly");
    const request = tx
      .objectStore(SNAPSHOT_HANDLE_STORE)
      .get(SNAPSHOT_HANDLE_KEY);
    const handle = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!handle) return null;
    if (await verifyPermission(handle, true)) {
      snapshotDirectoryHandle = handle;
      console.log("✅ Đã khôi phục thư mục lưu ảnh tự động.");
      return handle;
    }
    console.warn("Quyền truy cập vào thư mục lưu ảnh không còn hợp lệ.");
    return null;
  } catch (error) {
    console.warn("Không khôi phục được thư mục lưu ảnh:", error);
    return null;
  }
}

async function verifyPermission(handle, withWrite = false) {
  if (!handle.queryPermission || !handle.requestPermission) return false;
  const options = { mode: withWrite ? "readwrite" : "read" };
  let permission = await handle.queryPermission(options);
  if (permission === "granted") return true;
  if (permission === "prompt") {
    permission = await handle.requestPermission(options);
    return permission === "granted";
  }
  return false;
}

async function chooseSnapshotDirectory() {
  if (!window.showDirectoryPicker) {
    console.warn("Trình duyệt không hỗ trợ File System Access API.");
    return null;
  }

  try {
    snapshotDirectoryHandle = await window.showDirectoryPicker({
      startIn: "pictures",
    });
    if (snapshotDirectoryHandle) {
      await saveSnapshotDirectoryHandleToDB(snapshotDirectoryHandle);
    }
    return snapshotDirectoryHandle;
  } catch (error) {
    console.warn("Không chọn được thư mục lưu:", error);
    return null;
  }
}

async function getHistoryDirectoryHandle(date = new Date()) {
  if (!snapshotDirectoryHandle) {
    await chooseSnapshotDirectory();
  }
  if (!snapshotDirectoryHandle) return null;

  const folderName = getHistoryFolder(date);
  try {
    return await snapshotDirectoryHandle.getDirectoryHandle(folderName, {
      create: true,
    });
  } catch (error) {
    console.warn("Không tạo được thư mục History:", error);
    return null;
  }
}

function updateSnapshotFolderLabel() {
  const labelEl = document.getElementById("saveFolderLabel");
  if (!labelEl) return;
  if (snapshotDirectoryHandle) {
    labelEl.textContent = `Lưu ảnh vào: ${snapshotDirectoryHandle.name}/${getHistoryFolder(
      new Date(),
    )}`;
  } else if (window.showDirectoryPicker) {
    labelEl.textContent =
      "Chưa chọn thư mục lưu. Nhấn 'Chọn thư mục lưu' và chọn Pictures một lần để ảnh tự động vào Pictures/History_ddmmyy.";
  } else {
    labelEl.textContent =
      "Trình duyệt không hỗ trợ chọn thư mục. Ảnh sẽ lưu vào Download.";
  }
}

function updateSnapshotSaveControls() {
  const saveSnapshotBtn = document.getElementById("saveSnapshotBtn");
  const autoSaveToggleBtn = document.getElementById("autoSaveToggleBtn");
  if (autoSaveToggleBtn) {
    autoSaveToggleBtn.textContent = appState.autoSaveSnapshots
      ? "Tự động lưu: Bật"
      : "Tự động lưu: Tắt";
  }
  if (saveSnapshotBtn) {
    saveSnapshotBtn.style.display = appState.autoSaveSnapshots
      ? "none"
      : "inline-flex";
  }
}

async function ensureSnapshotDirectory() {
  if (snapshotDirectoryHandle || snapshotDirectoryRequestedOnce) {
    return snapshotDirectoryHandle;
  }
  snapshotDirectoryRequestedOnce = true;
  return await chooseSnapshotDirectory();
}

async function saveSnapshotImage(
  label,
  imageUrl,
  snapshotTimestamp,
  interactive = false,
) {
  const snapshotDate = snapshotTimestamp
    ? new Date(snapshotTimestamp)
    : new Date();
  const folder = getHistoryFolder(snapshotDate);
  const filename = getSnapshotFilename(label, snapshotDate);
  let savedViaFolder = false;

  if (!snapshotDirectoryHandle && interactive && window.showDirectoryPicker) {
    await ensureSnapshotDirectory();
    updateSnapshotFolderLabel();
  }

  if (snapshotDirectoryHandle) {
    try {
      const historyHandle = await getHistoryDirectoryHandle(snapshotDate);
      if (historyHandle) {
        const fileHandle = await historyHandle.getFileHandle(filename, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        const response = await fetch(imageUrl, { mode: "cors" });
        if (!response.ok) throw new Error("Không tải được ảnh");
        const blob = await response.blob();
        await writable.write(blob);
        await writable.close();
        savedViaFolder = true;
        console.log(
          `💾 Saved snapshot to ${snapshotDirectoryHandle.name}/${folder}/${filename}`,
        );
      }
    } catch (error) {
      console.warn(
        "Lưu ảnh vào thư mục không thành công, sẽ quay lại Download:",
        error,
      );
      savedViaFolder = false;
    }
  }

  if (!savedViaFolder && interactive) {
    try {
      const response = await fetch(imageUrl, { mode: "cors" });
      if (!response.ok) throw new Error("Không tải được ảnh");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folder}/${filename}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      console.log(`💾 Fallback download attempted: ${folder}/${filename}`);
    } catch (error) {
      console.warn("Không thể lưu ảnh bằng cách tải xuống:", error);
    }
  }

  if (!savedViaFolder && !interactive && !snapshotDirectoryHandle) {
    showNotification(
      "Vui lòng chọn thư mục lưu một lần để ảnh tự động được lưu vào Pictures/History_ddmmyy",
      "warning",
    );
  }
}

// initializeIMUChart removed

function startAutoUpdates() {
  setInterval(updateCurrentTime, 1000);
  setInterval(updatePing, CONFIG.PING_INTERVAL);
  setInterval(updateStatistics, CONFIG.STATS_UPDATE_INTERVAL);
  setInterval(updateWebSnapshot, CONFIG.TRASH_CHECK_INTERVAL);
}

window.addEventListener("error", (event) => {
  console.error("❌ Runtime error:", event.error);
  addCommandLog("❌ Lỗi: " + (event.error?.message || event.message), "error");
});

document.addEventListener("keydown", (e) => {
  if (!appState.isAuthenticated) return;
  if (e.key === "ArrowUp" && !e.repeat) {
    e.preventDefault();
    document.getElementById("btnForward")?.classList.add("active");
    sendCommand("FORWARD");
  }
  if (e.key === "ArrowDown" && !e.repeat) {
    e.preventDefault();
    document.getElementById("btnBackward")?.classList.add("active");
    sendCommand("BACKWARD");
  }
  if (e.key === "ArrowLeft" && !e.repeat) {
    e.preventDefault();
    document.getElementById("btnLeft")?.classList.add("active");
    sendCommand("LEFT");
  }
  if (e.key === "ArrowRight" && !e.repeat) {
    e.preventDefault();
    document.getElementById("btnRight")?.classList.add("active");
    sendCommand("RIGHT");
  }
  if (e.code === "Space") {
    e.preventDefault();
    sendCommand("STOP");
  }
});

document.addEventListener("keyup", (e) => {
  if (!appState.isAuthenticated) return;
  if (e.key === "ArrowUp") {
    document.getElementById("btnForward")?.classList.remove("active");
    sendCommand("STOP");
  }
  if (e.key === "ArrowDown") {
    document.getElementById("btnBackward")?.classList.remove("active");
    sendCommand("STOP");
  }
  if (e.key === "ArrowLeft") {
    document.getElementById("btnLeft")?.classList.remove("active");
    sendCommand("STOP");
  }
  if (e.key === "ArrowRight") {
    document.getElementById("btnRight")?.classList.remove("active");
    sendCommand("STOP");
  }
});

window.addEventListener("beforeunload", () => {
  if (appState.isAuthenticated) saveUserPreferences();
  try {
    if (
      window.__piBinsPolling &&
      typeof window.__piBinsPolling.stop === "function"
    )
      window.__piBinsPolling.stop();
  } catch (e) {
    /* ignore */
  }
});

console.log("✅ Bundled main.js loaded");
