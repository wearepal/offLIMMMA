import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { PaintbrushApp } from './PaintbrushApp'
import 'ol/ol.css'

// Electron API types
declare global {
  interface Window {
    initialBoundingBox?: {
      minX: number
      minY: number
      maxX: number
      maxY: number
      zoom?: number
      epsg: string
    }
    electronAPI: {
      saveFile: (data: string, defaultPath?: string) => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>
      openFile: () => Promise<{ success: boolean; data?: string; filePath?: string; fileName?: string; error?: string; canceled?: boolean }>
      openGeotiff: () => Promise<{ success: boolean; data?: ArrayBuffer; filePath?: string; fileName?: string; fileSizeMB?: number; error?: string; canceled?: boolean }>
      openVector: () => Promise<{ 
        success: boolean; 
        data?: ArrayBuffer; 
        shapefileData?: { shp: ArrayBuffer; dbf: ArrayBuffer | null; prj: string | null; shx: ArrayBuffer | null };
        filePath?: string; 
        fileName?: string; 
        fileType?: string; 
        fileSizeMB?: number; 
        error?: string; 
        canceled?: boolean 
      }>
      openLayer: () => Promise<{
        success: boolean;
        data?: ArrayBuffer;
        shapefileData?: { shp: ArrayBuffer; dbf: ArrayBuffer | null; prj: string | null; shx: ArrayBuffer | null };
        filePath?: string;
        fileName?: string;
        fileType?: string;
        fileSizeMB?: number;
        error?: string;
        canceled?: boolean;
      }>
      quickSave: (data: string, filePath: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      exportFile: (data: string, format: string, defaultPath?: string) => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>
      onTriggerSave: (callback: () => void) => () => void
      setUnsavedChanges: (hasUnsaved: boolean) => void
      platform: string
    }
    appInfo: {
      name: string
      version: string
    }
    hasUnsavedChanges: boolean
  }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root')
  if (!container) {
    console.error('Root element not found')
    return
  }

  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <PaintbrushApp />
    </React.StrictMode>
  )

  // Remove loading screen after minimum display time (2 seconds)
  setTimeout(() => {
    const loadingScreen = document.getElementById('loading-screen')
    if (loadingScreen) {
      loadingScreen.style.transition = 'opacity 0.3s ease-out'
      loadingScreen.style.opacity = '0'
      setTimeout(() => loadingScreen.remove(), 300)
    }
  }, 2000)
})

