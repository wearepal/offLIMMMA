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

## License

MIT
