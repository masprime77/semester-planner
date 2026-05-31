const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

// Where semester JSON files live:
//   - development: the project's /semesters folder
//   - production:  <userData>/semesters, so user data persists across app
//     updates (~/Library/Application Support/Semester Planner/semesters on macOS)
const SEMESTERS_DIR = app.isPackaged
  ? path.join(app.getPath('userData'), 'semesters')
  : path.join(__dirname, 'semesters');

// Reject ids that could escape the semesters directory.
const safeId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
const fileFor = (id) => path.join(SEMESTERS_DIR, `${id}.json`);

// Ensure the semesters directory exists. In production, seed it from the
// bundled example.json on first launch (when the folder is empty).
function ensureSemestersDir() {
  fs.mkdirSync(SEMESTERS_DIR, { recursive: true });
  if (!app.isPackaged) return;

  const hasData = fs.readdirSync(SEMESTERS_DIR).some((f) => f.endsWith('.json'));
  if (hasData) return;

  // extraResources places the bundled folder at <resources>/semesters.
  const bundledExample = path.join(process.resourcesPath, 'semesters', 'example.json');
  if (fs.existsSync(bundledExample)) {
    fs.copyFileSync(bundledExample, path.join(SEMESTERS_DIR, 'example.json'));
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  if (process.argv.includes('--dev-tools')) {
    win.webContents.openDevTools();
  }
}

// ---------------------------------------------------------------------------
// IPC: filesystem handlers (replace the old Express endpoints)
// ---------------------------------------------------------------------------
ipcMain.handle('list-semesters', () => {
  const files = fs.readdirSync(SEMESTERS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(SEMESTERS_DIR, f), 'utf8'));
    return { id: path.basename(f, '.json'), name: data.name || data.id };
  });
});

ipcMain.handle('get-semester', (event, id) => {
  if (!safeId(id) || !fs.existsSync(fileFor(id))) return null;
  return JSON.parse(fs.readFileSync(fileFor(id), 'utf8'));
});

ipcMain.handle('save-semester', (event, id, data) => {
  if (!safeId(id)) return { ok: false, error: 'Invalid id' };
  fs.writeFileSync(fileFor(id), JSON.stringify(data, null, 2));
  return { ok: true, id };
});

ipcMain.handle('delete-semester', (event, id) => {
  if (!safeId(id) || !fs.existsSync(fileFor(id))) return { ok: false, error: 'Not found' };
  fs.unlinkSync(fileFor(id));
  return { ok: true, id };
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  ensureSemestersDir();

  // Hide the default menu bar on macOS.
  if (process.platform === 'darwin') Menu.setApplicationMenu(null);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
