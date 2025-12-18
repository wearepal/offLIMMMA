const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const fs = require('fs')

// Copy JSTS to dist folder after build
class CopyJstsPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyJstsPlugin', () => {
      const src = path.join(__dirname, 'public', 'jsts.min.js')
      const dest = path.join(__dirname, 'dist', 'jsts.min.js')
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest)
      }
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
    new CopyJstsPlugin(),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    })
  ],
  devtool: 'source-map'
}

