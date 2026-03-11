const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    entry: {
      background: './src/background.ts',
      popup: './src/popup.tsx',
      content: './src/content.ts',
      modal: './src/modal.tsx'
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true
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
    
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx'],
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    
    plugins: [
      new HtmlWebpackPlugin({
        template: './popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
        inject: 'body'
      }),
      new HtmlWebpackPlugin({
        template: './modal.html',
        filename: 'modal.html',
        chunks: ['modal'],
        inject: 'body'
      })
    ],
    
    devtool: isProduction ? false : 'cheap-module-source-map',
    
    optimization: {
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all'
          }
        }
      }
    },
    
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    }
  };
}; 