const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// Keep a global reference of the window object
let mainWindow

function createWindow() {
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
    icon: path.join(__dirname, '../public/icon.png'),
    title: 'OffLIMMMA',
    backgroundColor: '#f8f9fc'
  })

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Handle window close with unsaved changes
  mainWindow.on('close', async (e) => {
    const hasUnsavedChanges = await mainWindow.webContents.executeJavaScript('window.hasUnsavedChanges || false')
    if (hasUnsavedChanges) {
      e.preventDefault()
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Save & Exit', 'Exit Without Saving', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?'
      })
      
      if (choice === 0) {
        // Save & Exit - trigger save then close
        mainWindow.webContents.send('trigger-save')
        // Wait a bit for save to complete, then close
        setTimeout(() => {
          mainWindow.destroy()
        }, 500)
      } else if (choice === 1) {
        // Exit without saving
        mainWindow.destroy()
      }
      // choice === 2 means Cancel, do nothing
    }
  })
}

// App ready
app.whenReady().then(createWindow)

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

// Open vector file (Shapefile, GeoJSON)
ipcMain.handle('open-vector', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Vector File',
    filters: [
      { name: 'All Vector Files', extensions: ['shp', 'zip', 'geojson', 'json'] },
      { name: 'Shapefile', extensions: ['shp', 'zip'] },
      { name: 'GeoJSON', extensions: ['geojson', 'json'] },
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

