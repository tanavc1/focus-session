// Thin shim so electron-forge/vite produces a unique filename (electron-main.js)
// rather than colliding with the preload's index.js output.
import './main/index';
