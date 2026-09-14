const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = function (_env, argv) {
  const production = argv.mode === 'production';

  return {
    context: path.resolve(__dirname, 'src'),
    entry: './app.js',
    target: ['web', 'es5'],
    devtool: production ? false : 'inline-source-map',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'viewer.js',
      clean: true,
      environment: {
        arrowFunction: false,
        const: false,
        destructuring: false,
        dynamicImport: false,
        forOf: false,
        module: false
      }
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: [['@babel/preset-env', { modules: false }]]
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader']
        }
      ]
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './index.html',
        inject: 'body',
        scriptLoading: 'defer',
        minify: production
          ? {
              collapseWhitespace: true,
              removeComments: true,
              removeRedundantAttributes: false,
              keepClosingSlash: true
            }
          : false
      })
    ],
    optimization: {
      minimize: production,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            ecma: 2015,
            compress: true,
            mangle: true,
            format: { comments: false, quote_keys: true, ascii_only: false }
          },
          extractComments: false
        })
      ]
    },
    devServer: {
      host: '127.0.0.1',
      port: 9000,
      hot: true,
      open: false,
      client: { overlay: true }
    }
  };
};
