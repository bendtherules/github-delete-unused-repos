const webpack = require("webpack");
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  devtool: 'inline-source-map',
  entry: {
    "index": './src/index.ts',
    "index.min": './src/index.ts',
  },
  output: {
    filename: 'dist/[name].js'
  },
  resolve: {
    // Add `.ts` and `.tsx` as a resolvable extension.
    extensions: ['.ts', '.tsx', '.js']
  },
  module: {
    rules: [
      { test: /\.js$/, loader: 'babel-loader', exclude: /node_modules/ },
      // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
      { test: /\.tsx?$/, loader: 'babel-loader!ts-loader', exclude: /node_modules/  },
      {
        test:/\.css$/,
        use:['style-loader','css-loader']
      },
    ]
  },
  plugins: [
    // new webpack.optimize.UglifyJsPlugin({
    //   include: /\.min\.js$/,
    //   minimize: true
    // }) , 
    new CopyWebpackPlugin([
      { from: 'demo/index.html', to: 'dist/' }
    ])
  ]
}