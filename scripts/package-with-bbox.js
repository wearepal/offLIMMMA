const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Parse arguments
const args = process.argv.slice(2)
const bboxIndex = args.findIndex(arg => arg.startsWith('--bbox='))
const epsgIndex = args.findIndex(arg => arg.startsWith('--epsg='))

if (bboxIndex === -1) {
  console.error('Usage: node scripts/package-with-bbox.js --bbox=minX,minY,maxX,maxY[,zoom] [--epsg=EPSG_CODE]')
  process.exit(1)
}

const bboxString = args[bboxIndex].split('=')[1]
const epsgCode = epsgIndex !== -1 ? args[epsgIndex].split('=')[1] : '4326'

// Update config.json
const configPath = path.join(__dirname, '../electron/config.json')
const config = {
  defaultBoundingBox: bboxString,
  defaultEpsg: epsgCode
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
console.log(`✓ Updated config.json with bounding box: ${bboxString}, EPSG: ${epsgCode}`)

// Run the package command (remove our custom args first)
const packageArgs = args.filter((arg, i) => i !== bboxIndex && i !== epsgIndex)
const platform = packageArgs.find(arg => ['--win', '--mac', '--linux'].includes(arg)) || ''

console.log('Building package...')
try {
  execSync(`npm run build && electron-builder ${platform}`, { stdio: 'inherit' })
  console.log('✓ Package built successfully with default bounding box!')
} catch (error) {
  console.error('✗ Build failed:', error.message)
  process.exit(1)
}

