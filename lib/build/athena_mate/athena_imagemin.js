/**
 * 暂时只压缩了png图片
 */
'use strict';

var fs = require('fs');
var through2 = require('through2');
var path = require('path');
var _ = require('lodash');
var gutil = require('gulp-util');
var pngquant = require('athena-png-native');
var chalk = require('chalk');
var mkdirp = require('mkdirp');

var Util = require('../../util');

function imagemin (opts) {
  opts = _.assign({
    app: null,
    module: null,
    cacheFolder: null,
    exclude: [],
    verbose: process.argv.indexOf('--verbose') !== -1
  }, opts);
  var imageminHash = {};
  var totalBytes = 0;
	var totalSavedBytes = 0;
	var totalFiles = 0;
	var validExts = ['.png'];
  var savedInfo = {};
  var stream = through2.obj(function (file, encoding, callback) {
    if (file.isNull()) {
      return callback(null, file);
    }
    if (file.isStream()){
      return callback(null, file);
    }
    if (file.isBuffer()) {
      if (validExts.indexOf(path.extname(file.path).toLowerCase()) === -1) {
        return callback(null, file);
      }
      var filename = path.basename(file.path);
      if (_.isArray(opts.exclude) && opts.exclude.length > 0) {
        var isExclude = false;
        opts.exclude.forEach(function (item) {
          if ((item instanceof RegExp && item.test(filename)) || item === filename) {
            isExclude = true;
          }
        });
        if (isExclude) {
          return callback(null, file);
        }
      }

      var compressedFileContents = pngquant.option({}).compress(file.contents);

			var originalSize = file.contents.length;
			var optimizedSize = compressedFileContents.length;
			var saved = originalSize - optimizedSize;
			var percent = originalSize > 0 ? (saved / originalSize) * 100 : 0;
			var savedMsg = '节约了 ' + Util.prettyBytes(saved) + ' - ' + percent.toFixed(1).replace(/\.0$/, '') + '%';
			var msg = saved > 0 ? savedMsg : '已经是压缩好了！';
      savedInfo[file.relative] = {
        originalSize: originalSize,
        optimizedSize: optimizedSize,
        saved: saved,
        percent: percent
      };
			totalBytes += originalSize;
			totalSavedBytes += saved;
			totalFiles++;

			if (opts.verbose) {
				gutil.log('imagemin:', chalk.green('✔ ') + file.relative + chalk.gray(' (' + msg + ')'));
			}

			file.contents = compressedFileContents;
      imageminHash[file.path] = Util.checksum(file.contents, 16);
			callback(null, file);
    }
  }, function (callback) {
    var percent = totalBytes > 0 ? (totalSavedBytes / totalBytes) * 100 : 0;
    var msg = '压缩了 ' + totalFiles + ' 个图片';

    if (totalFiles > 0) {
      msg += chalk.gray(' (节约了 ' + Util.prettyBytes(totalSavedBytes) + ' - ' + percent.toFixed(1).replace(/\.0$/, '') + '%)');
    }
    if (opts.onComplete) {
      opts.onComplete(savedInfo);
    }
    var cachePath = path.join(Util.getAthenaPath(), 'cache', 'build', opts.cacheFolder, opts.app, opts.module);
    var cacheFilePath = path.join(cachePath, 'cache_rev.json');
    var cacheJson = {};
    if (!Util.existsSync(cachePath)) {
      mkdirp.sync(cachePath);
    } else if (Util.existsSync(cacheFilePath)) {
      try {
        cacheJson = JSON.parse(fs.readFileSync(cacheFilePath));
      } catch (e) {
        console.log(e);
        cacheJson = {};
      }
    }
    fs.writeFileSync(cacheFilePath, JSON.stringify(_.assign(cacheJson, imageminHash), null, 2));
    gutil.log('imagemin:', msg);
    callback();
  });
  return stream;
}

module.exports = imagemin;
