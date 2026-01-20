const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const fs = require('fs')

// Copy public assets to dist folder after build
class CopyPublicAssetsPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyPublicAssetsPlugin', () => {
      const filesToCopy = ['jsts.min.js', 'icon.png', 'LEAF Indonesia logo (oval).png', 'univs.png', 'uos.png']
      filesToCopy.forEach(file => {
        const src = path.join(__dirname, 'public', file)
        const dest = path.join(__dirname, 'dist', file)
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest)
        }
      })
    })
  }
}

module.exports = {
  entry: './src/index.tsx',
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'renderer.js',
    clean: {
      keep: /jsts\.min\.js/
    }
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname)
    },
    fallback: {
      "http": false,
      "https": false,
      "url": false,
      "buffer": require.resolve("buffer/"),
      "stream": false,
      "fs": false,
      "path": false
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html'
    }),
    new CopyPublicAssetsPlugin(),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    })
  ],
  // Ensure relative chunk loading from dist/ when loaded via file://
  // (Electron main loads dist/index.html from disk.)
  devtool: 'source-map',
  optimization: {
    // Eliminate code-splitting so Electron can't hit stale chunk/runtime mismatches
    // (fixes "Cannot read properties of undefined (reading 'call')" / chunk load errors)
    splitChunks: false,
    runtimeChunk: false,
    moduleIds: 'deterministic',
    chunkIds: 'deterministic'
  }
}

