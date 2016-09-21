/**
* @fileoverview 模板抽离
* @author  liweitao
*/

'use strict';

module.exports = function ($, appConf, moduleConf, args) {
  return function (mod, modulePath, appPath) {
    return new Promise(function (resolve, reject) {
      var path = require('path');
      var fs = require('fs');
      var vfs = require('vinyl-fs');
      var through2 = require('through2');
      var _ = require('lodash');

      var Util = require('../../util');
      var athenaMate = require('../athena_mate');

      var tplVersionObj = {};
      var tplOutConf = moduleConf.support.tplOut || {
        type: 'cmd',
        deleteSpace: true
      };
      var isRelease = (args && args.release) ? args.release : false;

      return vfs.src(path.join(modulePath, 'dist', '_', 'widget', '**', '*.html'))
        .pipe(through2.obj(function (file, enc, cb) {
          var tplReg = /<script\b[^>]*.*?o2-out-tpl.*?>([\s\S]*?)<\/script>/gi;
          var tplWrapperReg = /o2-out-tpl-wrapper/g;
          var content = file.contents.toString();
          var filename = path.basename(file.path, path.extname(file.path));
          var tplName = filename + '_tpl';
          content = content.replace(tplReg, function (m, $1) {
            var tplFile = new $.util.File({
              base: path.join(modulePath, 'dist', '_', 'widget'),
              path: path.join(path.dirname(file.path), tplName + '.js'),
              contents: new Buffer($1)
            });
            this.push(tplFile);
            return '';
          }.bind(this)).replace(tplWrapperReg, 'data-tpl="' + tplName + '"');
          file.contents = new Buffer(content);
          this.push(file);
          cb();
        }, function (cb) {
          if (!_.isEmpty(tplVersionObj)) {
            fs.writeFileSync(path.join(modulePath, 'dist', 'tpl_version.json'), JSON.stringify(tplVersionObj, null, 2));
          }
          cb();
        }))
        .pipe($.if('*.js', athenaMate.scanServer({
          cwd: appPath,
          module: moduleConf.module,
          isRelease: isRelease,
          needScript: false
        })))
        .pipe($.if('*.js', through2.obj(function (file, enc, cb) {
          var filename = path.basename(file.path, path.extname(file.path));
          var content = file.contents.toString();
          content = content.replace(/[\n\r]/g, ' ');
          if (tplOutConf && tplOutConf.deleteSpace) {
            content = content.replace(/\s{2,}/g, '');
          }
          var md5 = Util.checksum(new Buffer(content), 16);
          var tplObjString = JSON.stringify({
            'version': md5,
            'time': new Date().getTime(),
            'dom': content
          }, null, 4);
          tplVersionObj[filename] = md5;
          var type = tplOutConf.type || 'cmd';
          if (type === 'cmd') {
            content = 'define(function() {\n  return ' + tplObjString + ';\n});';
          } else if (type === 'jsonp') {
            content = 'jsonCallBack_' + filename + '(' + tplObjString + ')';
          }
          file.contents = new Buffer(content);
          this.push(file);
          cb();
        })))
        .pipe(vfs.dest(path.join(modulePath, 'dist', '_', 'widget')))
        .on('finish', function() {
          vfs.src(path.join(modulePath, 'dist', '_', 'page', '**', '*.js'))
            .pipe(through2.obj(function (file, enc, cb) {
              var content = file.contents.toString();
              var tplVersionString = JSON.stringify(tplVersionObj, null, 2);
              tplVersionString = 'window.tplVersion = ' + tplVersionString + ';';
              if (Util.regexps.comment.test(content)) {
                var commentStart = -1;
                content = content.replace(Util.regexps.comment, function (m, $1, $2) {
                  if ($2 === 0) {
                    commentStart = 0;
                    return m + '\n' + tplVersionString;
                  }
                  return m;
                });
                if (commentStart === -1) {
                  content = tplVersionString + content;
                }
              } else {
                content = tplVersionString + content;
              }
              file.contents = new Buffer(content);
              this.push(file);
              cb();
            }))
            .pipe(vfs.dest(path.join(modulePath, 'dist', '_', 'page')))
            .on('finish', function() {
              resolve();
            });
        });
    });
  };
};
