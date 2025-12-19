# offLIMMMA - Offline LIMMMA Paintbrush Tool

This is an Electron application developed to generate GeoJSON annotation data for use in the LIMMMA platform.


## Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm (comes with Node.js)

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd offLIMMMA
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### Development

Run the application in development mode with hot-reloading:
```bash
npm run dev
```

### Production

Build and run the production version:
```bash
npm start
```

### Launching with Initial Bounding Box

You can specify an initial map view using a bounding box parameter with support for different coordinate systems:

```bash
# Format: --bbox=minX,minY,maxX,maxY[,zoom] --epsg=EPSG_CODE
# Using WGS84 (default, longitude/latitude):
npm start -- --bbox=106.8,-6.2,106.9,-6.1,12

# Using a different EPSG code (e.g., UTM Zone 48N):
npm start -- --bbox=500000,6900000,600000,7000000 --epsg=32648

# With the packaged Windows executable:
OffLIMMMA\ 1.0.0.exe --bbox=106.8,-6.2,106.9,-6.1,12 --epsg=4326

# Or from command line/PowerShell:
.\release\OffLIMMMA\ 1.0.0.exe --bbox=106.8,-6.2,106.9,-6.1,12
```

The bounding box parameters:
- `minX`: Minimum X coordinate (west/east depending on projection)
- `minY`: Minimum Y coordinate (south/north depending on projection)
- `maxX`: Maximum X coordinate
- `maxY`: Maximum Y coordinate
- `zoom`: Optional zoom level (if omitted, the map will auto-fit to the bounding box)
- `--epsg`: EPSG code for the coordinate system (default: 4326 for WGS84)

**Common EPSG codes:**
- `4326`: WGS84 (longitude/latitude) - default
- `3857`: Web Mercator (used internally by the map)
- `32648`: UTM Zone 48N (and other UTM zones)
- Many other coordinate systems supported by OpenLayers

## Building Distributable Packages

Create standalone executables for distribution:

```bash
# Windows
npm run package:win

# macOS
npm run package:mac

# Linux
npm run package:linux

# Current platform
npm run package
```

Built packages will be available in the `release/` directory.

### Building with Default Bounding Box

You can bake a default bounding box into the packaged executable:

```bash
# Windows with default bounding box
npm run package:win:bbox -- --bbox=106.8,-6.2,106.9,-6.1,12 --epsg=4326

# macOS with default bounding box  
npm run package:mac:bbox -- --bbox=106.8,-6.2,106.9,-6.1,12

# Linux with default bounding box
npm run package:linux:bbox -- --bbox=106.8,-6.2,106.9,-6.1,12 --epsg=4326
```

**Note:** The `--` is required to pass arguments to the script. Without it, npm will try to interpret them as npm config options.

When the packaged executable runs, it will automatically load to the specified bounding box. Users can still override this by passing `--bbox` arguments when launching the executable.

## License

MIT
