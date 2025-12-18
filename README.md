# Paintbrush - Map Annotation Tool

A standalone Electron application for painting polygons and annotations on maps. Works completely offline with OpenStreetMap tiles cached as you browse.

![Paintbrush App](https://via.placeholder.com/800x500?text=Paintbrush+Map+Annotation+Tool)

## Features

- **Polygon Painting**: Draw freehand polygons on the map that automatically close and merge with overlapping shapes
- **Class Management**: Create, edit, and reorder annotation classes with custom colors
- **Undo/Redo**: Full history support with keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z)
- **File Operations**: Save and load GeoJSON annotation files
- **Opacity Control**: Adjust the transparency of painted polygons
- **Offline Support**: Works without internet once map tiles are cached
- **Cross-Platform**: Runs on Windows, macOS, and Linux

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)

### Setup

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Usage

### Development Mode

Run the app in development mode with hot reloading:

```bash
npm run dev
```

### Production Build

Build and run the production version:

```bash
npm start
```

### Package for Distribution

Create distributable packages for your platform:

```bash
# For Windows
npm run package:win

# For macOS
npm run package:mac

# For Linux
npm run package:linux

# For current platform
npm run package
```

The packaged application will be in the `release` folder.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New Project | `Ctrl+N` |
| Open File | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Shift+Z` or `Ctrl+Y` |

## How to Use

1. **Create a Class**: Click "Add Class" in the sidebar to create a new annotation category
2. **Select Paint Tool**: Click the "Paint" button in the Tools section
3. **Draw Polygons**: Click and drag on the map to draw polygon shapes
4. **Manage Classes**: 
   - Click a class to select it for painting
   - Use the arrow buttons to reorder classes (affects render order)
   - Click the expand section to rename or change colors
5. **Erase**: Select the "Erase" tool and click on polygons to remove them
6. **Save Your Work**: Use `Ctrl+S` or click Save to export your annotations as GeoJSON

## File Format

Annotations are saved as GeoJSON with metadata:

```json
{
  "type": "FeatureCollection",
  "metadata": {
    "classes": [
      { "id": 1, "name": "Forest", "color": "#228B22", "order": 0 },
      { "id": 2, "name": "Water", "color": "#4169E1", "order": 1 }
    ],
    "exportedAt": "2024-01-01T00:00:00.000Z"
  },
  "features": [...]
}
```

## Tech Stack

- **Electron** - Cross-platform desktop framework
- **React** - UI components
- **OpenLayers** - Map rendering and interactions
- **TypeScript** - Type-safe JavaScript
- **JSTS** - Geometry operations (polygon merging)
- **Webpack** - Module bundling

## Project Structure

```
paintbrush/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Preload script for IPC
├── public/
│   └── index.html       # HTML template
├── src/
│   ├── index.tsx        # React entry point
│   ├── PaintbrushApp.tsx    # Main app component
│   ├── PaintbrushMap.tsx    # OpenLayers map component
│   ├── PaintbrushToolbar.tsx # Toolbar component
│   ├── PaintbrushSidebar.tsx # Sidebar component
│   └── utils/
│       ├── types.ts     # TypeScript types
│       ├── utils.ts     # Utility functions
│       └── merge_utils.ts # Polygon merging logic
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## License

MIT License - feel free to use this project for any purpose.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

