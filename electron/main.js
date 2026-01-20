const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Keep a global reference of the window object
let mainWindow
let hasUnsavedChanges = false
let isHandlingQuit = false

// Load default bounding box from config file (if exists)
function loadDefaultBoundingBox() {
  try {
    // In packaged app, config.json is in the same directory as main.js
    // In dev, it's in electron/config.json
    const configPath = path.join(__dirname, 'config.json')
    console.log('Looking for config.json at:', configPath)
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      console.log('Loaded config:', config)
      if (config.defaultBoundingBox) {
        const parts = config.defaultBoundingBox.split(',').map(Number)
        if (parts.length >= 4 && !parts.some(isNaN)) {
          const bbox = {
            minX: parts[0],
            minY: parts[1],
            maxX: parts[2],
            maxY: parts[3],
            zoom: parts[4] || undefined,
            epsg: config.defaultEpsg || '4326'
          }
          console.log('Parsed bounding box from config:', bbox)
          return bbox
        }
      }
    } else {
      console.log('Config file not found at:', configPath)
    }
  } catch (error) {
    console.warn('Failed to load default bounding box config:', error.message)
  }
  return null
}

// Parse command line arguments for bounding box
// Works in both development and packaged executable modes
// Falls back to default from config.json if no command-line args provided
function parseBoundingBox() {
  // First, try command-line arguments
  const bboxArg = process.argv.find(arg => arg && arg.startsWith('--bbox='))
  if (bboxArg) {
    const epsgArg = process.argv.find(arg => arg && arg.startsWith('--epsg='))
    const epsgCode = epsgArg ? epsgArg.split('=')[1] : '4326'
    
    const bboxString = bboxArg.split('=')[1]
    const parts = bboxString.split(',').map(Number)
    
    if (parts.length < 4 || parts.some(isNaN)) {
      console.warn('Invalid bounding box format. Expected: --bbox=minX,minY,maxX,maxY[,zoom]')
      return null
    }
    
    return {
      minX: parts[0],
      minY: parts[1],
      maxX: parts[2],
      maxY: parts[3],
      zoom: parts[4] || undefined,
      epsg: epsgCode
    }
  }
  
  // If no command-line args, try default from config file
  return loadDefaultBoundingBox()
}

function createWindow() {
  // Suppress Electron cache/quota errors (harmless but noisy)
  app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor')
  // In local dev (webpack watch), disable caching to avoid stale chunk/runtime mismatches
  if (!app.isPackaged) {
    app.commandLine.appendSwitch('disable-http-cache')
  }
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/icon.png').replace(/\\/g, '/'),
    title: 'OffLIMMMA',
    backgroundColor: '#f8f9fc'
  })

  // Parse bounding box before loading (so it's available immediately)
  const bbox = parseBoundingBox()
  if (bbox) {
    console.log('Found bounding box:', bbox)
  } else {
    console.log('No bounding box found (checking config.json at:', path.join(__dirname, 'config.json'))
  }
  
  // Inject bounding box script BEFORE loading the page
  if (bbox) {
    mainWindow.webContents.once('dom-ready', () => {
      mainWindow.webContents.executeJavaScript(`
        (function() {
          window.initialBoundingBox = {
            minX: ${bbox.minX},
            minY: ${bbox.minY},
            maxX: ${bbox.maxX},
            maxY: ${bbox.maxY},
            zoom: ${bbox.zoom !== undefined ? bbox.zoom : 'undefined'},
            epsg: '${bbox.epsg}'
          };
          console.log('Initial bounding box set (early):', window.initialBoundingBox);
        })();
      `)
    })
  }
  
  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))

  // In local dev (webpack watch), reload the window when dist/ changes
  // so renderer.js + its async chunks stay in sync.
  if (!app.isPackaged) {
    try {
      const distDir = path.join(__dirname, '../dist')
      let reloadTimer = null
      fs.watch(distDir, { recursive: true }, (eventType, filename) => {
        if (!filename) return
        if (!filename.endsWith('.js') && !filename.endsWith('.html')) return
        if (!mainWindow || mainWindow.isDestroyed()) return

        // debounce rapid rebuild events
        if (reloadTimer) clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => {
          try {
            // Clear cache + reload to prevent runtime/chunk mismatches
            mainWindow.webContents.session.clearCache().finally(() => {
              mainWindow.webContents.reloadIgnoringCache()
            })
          } catch (e) {
            // ignore
          }
        }, 250)
      })
    } catch (e) {
      console.warn('Failed to watch dist for reload:', e.message)
    }
  }
  
  // Also set it after load as backup
  mainWindow.webContents.once('did-finish-load', () => {
    if (bbox) {
      mainWindow.webContents.executeJavaScript(`
        if (!window.initialBoundingBox) {
          window.initialBoundingBox = {
            minX: ${bbox.minX},
            minY: ${bbox.minY},
            maxX: ${bbox.maxX},
            maxY: ${bbox.maxY},
            zoom: ${bbox.zoom !== undefined ? bbox.zoom : 'undefined'},
            epsg: '${bbox.epsg}'
          };
          console.log('Initial bounding box set (late):', window.initialBoundingBox);
        }
      `)
    }
  })

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle window close with unsaved changes
  mainWindow.on('close', (e) => {
    console.log('Window close event triggered')
    console.log('Main process hasUnsavedChanges:', hasUnsavedChanges)
    console.log('isHandlingQuit:', isHandlingQuit)
    
    // If before-quit already handled it, don't handle again
    if (isHandlingQuit) {
      console.log('Quit already being handled, allowing close')
      return
    }
    
    // Check unsaved changes synchronously first - MUST prevent default synchronously
    if (hasUnsavedChanges) {
      console.log('Preventing window close and showing dialog')
      isHandlingQuit = true
      e.preventDefault()
      
      // Show dialog immediately (synchronously)
      console.log('About to show dialog')
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Save', 'Don\'t Save', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Do you want to save before closing?',
        detail: 'Your changes will be lost if you don\'t save them.'
      })
      console.log('Dialog choice:', choice)
      
      if (choice === 0) {
        // Save - trigger save and wait for it to complete
        mainWindow.webContents.send('trigger-save')
        
        // Wait for save to complete (poll for unsaved changes to clear)
        let attempts = 0
        const maxAttempts = 25 // 5 seconds max wait
        
        const checkSaveComplete = setInterval(async () => {
          attempts++
          const stillUnsaved = await mainWindow.webContents.executeJavaScript('window.hasUnsavedChanges || false')
          
          if (!stillUnsaved || attempts >= maxAttempts) {
            clearInterval(checkSaveComplete)
            if (stillUnsaved && attempts >= maxAttempts) {
              // Save didn't complete in time, ask user
              const retryChoice = dialog.showMessageBoxSync(mainWindow, {
                type: 'warning',
                buttons: ['Exit Without Saving', 'Cancel'],
                defaultId: 1,
                cancelId: 1,
                title: 'Save Incomplete',
                message: 'Save may not have completed. Exit anyway?'
              })
              if (retryChoice === 0) {
                isHandlingQuit = false
                mainWindow.destroy()
              } else {
                isHandlingQuit = false
              }
            } else {
              // Save completed successfully
              isHandlingQuit = false
              mainWindow.destroy()
            }
          }
        }, 200)
      } else if (choice === 1) {
        // Don't Save - exit without saving
        isHandlingQuit = false
        mainWindow.destroy()
      } else {
        // Cancel
        isHandlingQuit = false
      }
      // choice === 2 means Cancel, do nothing
    } else {
      console.log('No unsaved changes, allowing close')
    }
  })
}

// App ready
app.whenReady().then(createWindow)

// Handle app quit with unsaved changes check
app.on('before-quit', (e) => {
  console.log('before-quit event triggered')
  console.log('Main process hasUnsavedChanges:', hasUnsavedChanges)
  
  if (hasUnsavedChanges && mainWindow && !mainWindow.isDestroyed()) {
    console.log('Preventing quit and showing dialog')
    isHandlingQuit = true
    e.preventDefault()
    
    // Show dialog immediately (synchronously)
    console.log('About to show dialog')
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Save', 'Don\'t Save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Unsaved Changes',
      message: 'You have unsaved changes. Do you want to save before closing?',
      detail: 'Your changes will be lost if you don\'t save them.'
    })
    console.log('Dialog choice:', choice)
    
    if (choice === 0) {
      // Save - trigger save and wait for it to complete
      mainWindow.webContents.send('trigger-save')
      
      // Wait for save to complete (poll for unsaved changes to clear)
      let attempts = 0
      const maxAttempts = 25 // 5 seconds max wait
      
      const checkSaveComplete = setInterval(async () => {
        attempts++
        const stillUnsaved = await mainWindow.webContents.executeJavaScript('window.hasUnsavedChanges || false')
        
        if (!stillUnsaved || attempts >= maxAttempts) {
          clearInterval(checkSaveComplete)
          if (stillUnsaved && attempts >= maxAttempts) {
            // Save didn't complete in time, ask user
            const retryChoice = dialog.showMessageBoxSync(mainWindow, {
              type: 'warning',
              buttons: ['Exit Without Saving', 'Cancel'],
              defaultId: 1,
              cancelId: 1,
              title: 'Save Incomplete',
              message: 'Save may not have completed. Exit anyway?'
            })
            if (retryChoice === 0) {
              isHandlingQuit = false
              app.quit()
            } else {
              isHandlingQuit = false
            }
          } else {
            // Save completed successfully
            isHandlingQuit = false
            app.quit()
          }
        }
      }, 200)
    } else if (choice === 1) {
      // Don't Save - exit without saving
      isHandlingQuit = false
      app.quit()
    } else {
      // Cancel
      isHandlingQuit = false
    }
    // choice === 2 means Cancel, do nothing
  } else {
    console.log('No unsaved changes, allowing quit')
  }
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// IPC Handlers

// Handle unsaved changes state updates from renderer
ipcMain.on('set-unsaved-changes', (event, hasUnsaved) => {
  hasUnsavedChanges = hasUnsaved
  console.log('Main process: hasUnsavedChanges set to', hasUnsavedChanges)
})

// IPC Handlers for file operations

// Save GeoJSON file
ipcMain.handle('save-file', async (event, { data, defaultPath }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Annotation',
    defaultPath: defaultPath || 'annotation.geojson',
    filters: [
      { name: 'GeoJSON Files', extensions: ['geojson', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, data, 'utf8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  return { success: false, canceled: true }
})

// Open GeoJSON file
ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Annotation',
    filters: [
      { name: 'GeoJSON Files', extensions: ['geojson', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const data = fs.readFileSync(result.filePaths[0], 'utf8')
      return { 
        success: true, 
        data, 
        filePath: result.filePaths[0],
        fileName: path.basename(result.filePaths[0], path.extname(result.filePaths[0]))
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  return { success: false, canceled: true }
})

// Quick save to existing file
ipcMain.handle('quick-save', async (event, { data, filePath }) => {
  if (!filePath) {
    return { success: false, error: 'No file path specified' }
  }
  
  try {
    fs.writeFileSync(filePath, data, 'utf8')
    return { success: true, filePath }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Open GeoTIFF file
ipcMain.handle('open-geotiff', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open GeoTIFF',
    filters: [
      { name: 'GeoTIFF Files', extensions: ['tif', 'tiff', 'geotiff'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const fileName = path.basename(filePath)
    
    // Check file size first
    const stats = fs.statSync(filePath)
    const fileSizeMB = stats.size / (1024 * 1024)
    
    // Hard limit at 1GB to prevent crashes
    if (fileSizeMB > 1024) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        buttons: ['OK'],
        title: 'File Too Large',
        message: `This GeoTIFF is ${fileSizeMB.toFixed(0)}MB which exceeds the 1GB limit.\n\nFor large GeoTIFFs, please:\n1. Use QGIS or GDAL to create a smaller extract\n2. Convert to Cloud Optimized GeoTIFF (COG)\n3. Reduce resolution with: gdal_translate -outsize 25% 25% input.tif smaller.tif`,
      })
      return { success: false, error: 'File too large (max 1GB)' }
    }
    
    try {
      // Read file into buffer
      const data = fs.readFileSync(filePath)
      return { 
        success: true, 
        data: data.buffer,
        filePath,
        fileName,
        fileSizeMB
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  return { success: false, canceled: true }
})

// Open vector file (Shapefile, GeoJSON, KML)
ipcMain.handle('open-vector', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Vector File',
    filters: [
      { name: 'All Vector Files', extensions: ['shp', 'zip', 'geojson', 'json', 'kml'] },
      { name: 'Shapefile', extensions: ['shp', 'zip'] },
      { name: 'GeoJSON', extensions: ['geojson', 'json'] },
      { name: 'KML', extensions: ['kml'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const fileName = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const dir = path.dirname(filePath)
    const baseName = path.basename(filePath, ext)
    
    // Check file size
    const stats = fs.statSync(filePath)
    const fileSizeMB = stats.size / (1024 * 1024)
    
    // Limit at 500MB for vector files
    if (fileSizeMB > 500) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        buttons: ['OK'],
        title: 'File Too Large',
        message: `This file is ${fileSizeMB.toFixed(0)}MB which exceeds the 500MB limit for vector files.`,
      })
      return { success: false, error: 'File too large (max 500MB)' }
    }
    
    // Determine file type
    let fileType = 'unknown'
    if (ext === '.zip') {
      fileType = 'shapefile-zip'
    } else if (ext === '.shp') {
      fileType = 'shapefile'
    } else if (ext === '.geojson' || ext === '.json') {
      fileType = 'geojson'
    } else if (ext === '.kml') {
      fileType = 'kml'
    }
    
    try {
      // For .shp files, also read the companion files
      if (ext === '.shp') {
        const shapefileData = {
          shp: fs.readFileSync(filePath).buffer,
          dbf: null,
          prj: null,
          shx: null
        }
        
        // Try to read companion files
        const dbfPath = path.join(dir, baseName + '.dbf')
        const prjPath = path.join(dir, baseName + '.prj')
        const shxPath = path.join(dir, baseName + '.shx')
        
        // Also check for uppercase extensions
        const dbfPathUpper = path.join(dir, baseName + '.DBF')
        const prjPathUpper = path.join(dir, baseName + '.PRJ')
        const shxPathUpper = path.join(dir, baseName + '.SHX')
        
        if (fs.existsSync(dbfPath)) {
          shapefileData.dbf = fs.readFileSync(dbfPath).buffer
        } else if (fs.existsSync(dbfPathUpper)) {
          shapefileData.dbf = fs.readFileSync(dbfPathUpper).buffer
        }
        
        if (fs.existsSync(prjPath)) {
          shapefileData.prj = fs.readFileSync(prjPath).toString()
        } else if (fs.existsSync(prjPathUpper)) {
          shapefileData.prj = fs.readFileSync(prjPathUpper).toString()
        }
        
        if (fs.existsSync(shxPath)) {
          shapefileData.shx = fs.readFileSync(shxPath).buffer
        } else if (fs.existsSync(shxPathUpper)) {
          shapefileData.shx = fs.readFileSync(shxPathUpper).buffer
        }
        
        return { 
          success: true, 
          shapefileData,
          filePath,
          fileName,
          fileType,
          fileSizeMB
        }
      }
      
      // For other files, just read the single file
      const data = fs.readFileSync(filePath)
      return { 
        success: true, 
        data: data.buffer,
        filePath,
        fileName,
        fileType,
        fileSizeMB
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  return { success: false, canceled: true }
})

// Open a layer file (GeoTIFF or Vector). Discerns type by extension.
ipcMain.handle('open-layer', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Layer',
    filters: [
      { name: 'Supported Files', extensions: ['tif', 'tiff', 'geotiff', 'shp', 'zip', 'geojson', 'json', 'kml'] },
      { name: 'GeoTIFF', extensions: ['tif', 'tiff', 'geotiff'] },
      { name: 'Vector', extensions: ['shp', 'zip', 'geojson', 'json', 'kml'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const fileName = path.basename(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const dir = path.dirname(filePath)
    const baseName = path.basename(filePath, ext)

    // Check file size
    const stats = fs.statSync(filePath)
    const fileSizeMB = stats.size / (1024 * 1024)

    // Apply limits similar to existing handlers
    const isGeotiff = ext === '.tif' || ext === '.tiff' || ext === '.geotiff'
    if (isGeotiff && fileSizeMB > 1024) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        buttons: ['OK'],
        title: 'File Too Large',
        message: `This GeoTIFF is ${fileSizeMB.toFixed(0)}MB which exceeds the 1GB limit.`,
      })
      return { success: false, error: 'File too large (max 1GB)' }
    }
    if (!isGeotiff && fileSizeMB > 500) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        buttons: ['OK'],
        title: 'File Too Large',
        message: `This file is ${fileSizeMB.toFixed(0)}MB which exceeds the 500MB limit for vector files.`,
      })
      return { success: false, error: 'File too large (max 500MB)' }
    }

    // Determine file type
    let fileType = 'unknown'
    if (isGeotiff) {
      fileType = 'geotiff'
    } else if (ext === '.zip') {
      fileType = 'shapefile-zip'
    } else if (ext === '.shp') {
      fileType = 'shapefile'
    } else if (ext === '.geojson' || ext === '.json') {
      fileType = 'geojson'
    } else if (ext === '.kml') {
      fileType = 'kml'
    }

    try {
      // For .shp files, also read the companion files
      if (ext === '.shp') {
        const shapefileData = {
          shp: fs.readFileSync(filePath).buffer,
          dbf: null,
          prj: null,
          shx: null
        }

        // Try to read companion files
        const dbfPath = path.join(dir, baseName + '.dbf')
        const prjPath = path.join(dir, baseName + '.prj')
        const shxPath = path.join(dir, baseName + '.shx')

        // Also check for uppercase extensions
        const dbfPathUpper = path.join(dir, baseName + '.DBF')
        const prjPathUpper = path.join(dir, baseName + '.PRJ')
        const shxPathUpper = path.join(dir, baseName + '.SHX')

        if (fs.existsSync(dbfPath)) {
          shapefileData.dbf = fs.readFileSync(dbfPath).buffer
        } else if (fs.existsSync(dbfPathUpper)) {
          shapefileData.dbf = fs.readFileSync(dbfPathUpper).buffer
        }

        if (fs.existsSync(prjPath)) {
          shapefileData.prj = fs.readFileSync(prjPath).toString()
        } else if (fs.existsSync(prjPathUpper)) {
          shapefileData.prj = fs.readFileSync(prjPathUpper).toString()
        }

        if (fs.existsSync(shxPath)) {
          shapefileData.shx = fs.readFileSync(shxPath).buffer
        } else if (fs.existsSync(shxPathUpper)) {
          shapefileData.shx = fs.readFileSync(shxPathUpper).buffer
        }

        return {
          success: true,
          shapefileData,
          filePath,
          fileName,
          fileType,
          fileSizeMB
        }
      }

      // Other types: read single file
      const data = fs.readFileSync(filePath)
      return {
        success: true,
        data: data.buffer,
        filePath,
        fileName,
        fileType,
        fileSizeMB
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  return { success: false, canceled: true }
})

// Export as different formats
ipcMain.handle('export-file', async (event, { data, format, defaultPath }) => {
  const filters = {
    geojson: { name: 'GeoJSON Files', extensions: ['geojson', 'json'] },
    kml: { name: 'KML Files', extensions: ['kml'] },
    gpx: { name: 'GPX Files', extensions: ['gpx'] }
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: `Export as ${format.toUpperCase()}`,
    defaultPath: defaultPath || `annotation.${format}`,
    filters: [
      filters[format] || filters.geojson,
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, data, 'utf8')
      return { success: true, filePath: result.filePath }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  return { success: false, canceled: true }
})

