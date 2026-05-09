const {
  app, BrowserWindow, clipboard, nativeImage, Tray, Menu,
  globalShortcut, screen, ipcMain, protocol, net
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── Paths (lazy - app.getPath only works after ready) ─────────────────
function getDataDir() { return path.join(app.getPath('userData'), 'data'); }
function getImagesDir() { return path.join(getDataDir(), 'images'); }
function getDbPath() { return path.join(getDataDir(), 'clips.json'); }
const TRAY_ICON = path.join(__dirname, 'assets', 'icon.png');

// ─── State ──────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let clips = [];
let isQuitting = false;

// ─── JSON Storage ───────────────────────────────────────────────────────
function loadClips() {
  const dbPath = getDbPath();
  try {
    if (fs.existsSync(dbPath)) {
      clips = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    }
  } catch { clips = []; }
}

// Clean up orphaned image files (referenced by no clip)
function cleanOrphanedImages() {
  const imgDir = getImagesDir();
  if (!fs.existsSync(imgDir)) return;
  const referenced = new Set(clips.filter(c => c.image_filename).map(c => c.image_filename));
  for (const file of fs.readdirSync(imgDir)) {
    if (!referenced.has(file)) {
      try { fs.unlinkSync(path.join(imgDir, file)); } catch {}
    }
  }
}

function saveClips() {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.writeFileSync(getDbPath(), JSON.stringify(clips));
}

function cleanupOldClips() {
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const before = clips.length;
  clips = clips.filter(c => new Date(c.created_at).getTime() > threeDaysAgo);
  clips.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (clips.length > 100) {
    const removed = clips.splice(100);
    for (const c of removed) {
      if (c.image_filename) {
        try { fs.unlinkSync(path.join(getImagesDir(), c.image_filename)); } catch {}
      }
    }
  }
  if (clips.length !== before) saveClips();
}

function addClip(type, textContent, imageBuffer) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let imageFilename = null;
  let imageHash = null;

  // Deduplicate: remove old clips with identical content
  if (type === 'text' && textContent) {
    const dupIdx = clips.findIndex(c => c.type === 'text' && c.text_content === textContent);
    if (dupIdx !== -1) clips.splice(dupIdx, 1);
  } else if (type === 'image' && imageBuffer) {
    imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const dupIdx = clips.findIndex(c => c.type === 'image' && c.image_hash === imageHash);
    if (dupIdx !== -1) {
      const dup = clips[dupIdx];
      if (dup.image_filename) {
        try { fs.unlinkSync(path.join(getImagesDir(), dup.image_filename)); } catch {}
      }
      clips.splice(dupIdx, 1);
    }

    fs.mkdirSync(getImagesDir(), { recursive: true });
    imageFilename = `${id}.png`;
    fs.writeFileSync(path.join(getImagesDir(), imageFilename), imageBuffer);
  }

  clips.unshift({
    id, type, text_content: textContent || null,
    image_filename: imageFilename, image_hash: imageHash, created_at: now
  });

  saveClips();
  cleanupOldClips();
  return id;
}

function queryClips() {
  return clips.map(c => ({
    ...c,
    image_url: c.image_filename
      ? `clipboard-image://${c.image_filename}` : null
  }));
}

// ─── Clipboard Monitor ──────────────────────────────────────────────────
let lastText = '';
let lastImageDataUrl = '';

function checkClipboard() {
  try {
    const text = clipboard.readText();
    if (text && text !== lastText) {
      lastText = text;
      lastImageDataUrl = '';
      addClip('text', text, null);
    }

    const img = clipboard.readImage();
    if (!img.isEmpty()) {
      const dataUrl = img.toDataURL();
      if (dataUrl !== lastImageDataUrl) {
        lastImageDataUrl = dataUrl;
        lastText = '';
        addClip('image', null, img.toPNG());
      }
    }
  } catch {}
}

// ─── Window ─────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 380,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('blur', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

function showWindow() {
  if (!mainWindow) return;
  const cursor = screen.getCursorScreenPoint();
  const winBounds = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x: dx, y: dy, width: dw, height: dh } = display.bounds;

  let winX = Math.round(cursor.x - winBounds.width / 2);
  let winY = Math.round(cursor.y - 20);
  winX = Math.max(dx + 8, Math.min(winX, dx + dw - winBounds.width - 8));
  winY = Math.max(dy + 8, Math.min(winY, dy + dh - winBounds.height - 8));

  mainWindow.setPosition(winX, winY);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('window-shown');
}

function toggleWindow() {
  if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
  else showWindow();
}

// ─── Custom Protocol for Image Loading ──────────────────────────────────
function registerImageProtocol() {
  protocol.handle('clipboard-image', (request) => {
    const filename = decodeURIComponent(request.url.replace('clipboard-image://', ''));
    const filePath = path.join(getImagesDir(), filename);
    return net.fetch('file:///' + filePath.replace(/\\/g, '/'));
  });
}

// ─── Tray ───────────────────────────────────────────────────────────────
function createTray() {
  let trayIcon;
  if (fs.existsSync(TRAY_ICON)) {
    trayIcon = nativeImage.createFromPath(TRAY_ICON);
  } else {
    const S = 32, W = 255;
    const buf = Buffer.alloc(S * S * 4, 0);
    const set = (x, y, r, g, b, a) => {
      if (x < 0 || x >= S || y < 0 || y >= S) return;
      const i = (y * S + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
    };
    // clip bar
    for (let y = 4; y <= 7; y++) for (let x = 12; x <= 20; x++) set(x, y, W, W, W, 255);
    set(11, 5, W, W, W, 255); set(11, 6, W, W, W, 255);
    set(21, 5, W, W, W, 255); set(21, 6, W, W, W, 255);
    set(11, 8, W, W, W, 255); set(21, 8, W, W, W, 255);
    for (let x = 12; x <= 20; x++) set(x, 8, W, W, W, 255);
    // board outline
    for (let y = 9; y <= 27; y++) { set(7, y, W, W, W, 255); set(8, y, W, W, W, 255); set(24, y, W, W, W, 255); set(25, y, W, W, W, 255); }
    for (let x = 8; x <= 10; x++) { set(x, 9, W, W, W, 255); set(x, 10, W, W, W, 255); }
    for (let x = 22; x <= 24; x++) { set(x, 9, W, W, W, 255); set(x, 10, W, W, W, 255); }
    for (let x = 7; x <= 25; x++) set(x, 28, W, W, W, 255);
    for (let x = 7; x <= 9; x++) set(x, 27, W, W, W, 255);
    for (let x = 23; x <= 25; x++) set(x, 27, W, W, W, 255);
    set(9, 9, W, W, W, 255); set(23, 9, W, W, W, 255);
    set(9, 27, W, W, W, 255); set(23, 27, W, W, W, 255);
    // text lines
    for (let x = 10; x <= 22; x++) set(x, 14, W, W, W, 200);
    for (let x = 10; x <= 17; x++) set(x, 18, W, W, W, 160);
    for (let x = 10; x <= 20; x++) set(x, 22, W, W, W, 130);
    trayIcon = nativeImage.createFromBitmap(buf, { width: S, height: S });
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('历史剪贴板');

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示历史', click: showWindow },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', toggleWindow);
}

// ─── IPC ────────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('get-clips', () => queryClips());
  ipcMain.handle('paste-clip', (_, id) => {
    const clip = clips.find(c => c.id === id);
    if (!clip) return;

    if (clip.type === 'text') {
      clipboard.writeText(clip.text_content || '');
    } else if (clip.type === 'image' && clip.image_filename) {
      const imgPath = path.join(getImagesDir(), clip.image_filename);
      if (fs.existsSync(imgPath)) {
        clipboard.writeImage(nativeImage.createFromPath(imgPath));
      }
    }

    mainWindow.hide();
  });
  ipcMain.handle('hide-window', () => {
    if (mainWindow) mainWindow.hide();
  });
}

// ─── App Lifecycle ──────────────────────────────────────────────────────
app.whenReady().then(() => {
  loadClips();
  cleanOrphanedImages();
  registerImageProtocol();
  createWindow();
  createTray();
  setupIPC();

  setInterval(checkClipboard, 500);
  globalShortcut.register('CommandOrControl+Shift+V', toggleWindow);
  app.setLoginItemSettings({ openAtLogin: true });
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  saveClips();
});
