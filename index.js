#! /usr/bin/env node --harmony
/**
 * 主入口，程序控制
 */

'use strict';
var fs = require('fs');
var path = require('path');
var request = require('request');
var inquirer = require('inquirer');
var program = require('commander');
var chalk = require('chalk');
var gutil = require('gulp-util');

var Util = require('./lib/util');
var App = require('./lib/create/task/app');
var MModule = require('./lib/create/task/module');
var Page = require('./lib/create/task/page');
var Widget = require('./lib/create/task/widget');
var builder = require('./lib/build');

var rootPath = __dirname;

var reportPath = '/api/commands';
var userHome = Util.homedir();
var userName = process.env.USER || path.basename(userHome);
var config = Util.getConfig();
var setting = Util.getSetting();

// 数据上报
function report (command, args, processParams, cb) {
  var requestParams = {
    cmd: command,
    time: new Date().getTime(),
    user: Util.getConfig().user_name,
    args: args
  };
  if (typeof processParams === 'function') {
    processParams(requestParams);
  }
  if (typeof cb !== 'function') {
    cb = function () {};
  }
  request.post(setting.report_url + reportPath, {
    form: requestParams,
    timeout: 5000
  }, function (err, res, body) {
    if (err) {
      console.log(chalk.red('  上报失败'));
      cb();
      return;
    }
    if (res.statusCode === 200 || res.statusCode === 201) {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.log(chalk.red('  上报失败'));
      }
    } else {
      console.log(chalk.red('  上报失败'));
    }
    cb(body);
  });
}
var athenaText = fs.readFileSync(path.join(__dirname, 'athena.txt'));
console.log(gutil.colors.blue(String(athenaText)));
program
  .version('0.0.1');

program
  .command('init [url]')
  .description('初始化Athena')
  .action(function (url) {
    console.log(chalk.magenta('  Allo ' + userName + '! 开始愉快工作吧~'));
    if (!url) {
      url = process.cwd();
      console.log('  即将设置工作目录为当前目录！');
    } else {
      console.log('  即将设置工作目录为：', url);
    }
    console.log();
    var prompt = [];
    if (!config.work_space) {
      config.work_space = url;
    } else {
      if (config.work_space !== url) {
        prompt.push({
          type: 'confirm',
          name: 'needNewWorkSpace',
          message: '已经设置过工作目录' + config.work_space + '，是否要以新目录为工作目录？',
          default: false
        });
      }
    }
    prompt.push({
      type: 'input',
      name: 'userName',
      message: '雁过留声，人过留名~~',
      default: userName
    });
    inquirer.prompt(prompt, function (answers) {
      if (answers.needNewWorkSpace) {
        config.work_space = url;
      }
      config.user_name = answers.userName;
      Util.setConfig(config);
    });
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena init');
    console.log();
  });

program
  .command('app [appName]')
  .alias('a')
  .description('创建新的项目')
  .option('--name [appName]', '项目名称')
  .option('--description [appDescription]', '项目描述')
  .option('--sass', '启用sass')
  .option('--less', '启用less')
  .option('--template [templateName]', '设置模板')
  .action(function(appName, option) {
    var app = new App({
      appName: appName || option.name,
      description: option.description,
      sass: option.sass,
      less: option.less,
      tmpId: option.template
    });
    app.create(function () {
      var argv = [].slice.call(arguments);
      report('app', argv, function (params) {
        var appConfPath = app.destinationPath(argv[0], 'app-conf.js');
        var commonModuleConfPath = app.destinationPath(argv[0], 'gb', 'module-conf.js');
        var commonModuleConf = require(commonModuleConfPath);
        params.appName = argv[0];
        params.appId = require(appConfPath).appId;
        params.commonModuleId = commonModuleConf.moduleId;
        params.commonModuleName = commonModuleConf.module;
      }, function (body) {
        if (body && body.no === 0) {
          console.log('success');
        }
      });
    });

  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena app cx');
    console.log('    $ athena a cx');
    console.log();
  });

program
  .command('module [moduleName]')
  .alias('m')
  .description('创建新的模块')
  .option('--name [appName]', '模块名称')
  .option('--description [moduleDescription]', '模块描述')
  .option('--sass', '启用sass')
  .option('--less', '启用less')
  .action(function(moduleName, option) {
    if (moduleName) {
      var moduleList = moduleName.split(',');
      var promises = [];
      promises = moduleList.map(function (item) {
        return createModule.bind(null, item, option);
      });
      promises.reduce(function (prev, curr) {
        return prev.then(function () {
          return curr();
        });
      }, Promise.resolve('start')).catch(function (e) {
        if (e) {
          console.log(e.plugin);
          if (e.stack) {
            console.log(e.stack);
          }
        }
      });
    } else {
      createModule(moduleName, option);
    }
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena module my');
    console.log('    $ athena m my');
    console.log('    $ athena m my,hello');
    console.log();
  });

function createModule (moduleName, option) {
  return new Promise(function (resolve, reject) {
    var mmodule = new MModule({
      moduleName: moduleName || option.name,
      moduleDescription: option.description,
      sass: option.sass,
      less: option.less
    });
    var appConfPath = mmodule.destinationPath('app-conf.js');
    if (!fs.existsSync(appConfPath)) {
      console.log(chalk.red('  出错了，当前目录没有app-conf.js，请检查当前目录是否是项目目录！'));
      reject();
      return;
    }
    mmodule.create(function () {
      var argv = [].slice.call(arguments);
      var appConf = require(appConfPath);
      if (appConf) {
        report('module', argv, function (params) {
          var moduleConfPath = mmodule.destinationPath(argv[0], 'module-conf.js');
          params.moduleName = argv[0];
          params.moduleId = require(moduleConfPath).moduleId;
          params.appName = appConf.app;
          params.appId = appConf.appId;
        }, function (body) {
          if (body && body.no === 0) {
            console.log('success');
          }
          resolve();
        });
      }
    });
  });
}

program
  .command('page [pageName]')
  .alias('pa')
  .description('创建新的页面')
  .option('--name [pageName]', '页面名称')
  .option('--description [pageDescription]', '页面描述')
  .option('--sass', '启用sass')
  .option('--less', '启用less')
  .option('--remote [remoteName]', '选择域')
  .action(function(pageName, option) {
    var page = new Page({
      pageName: pageName || option.name,
      description: option.description,
      sass: option.sass,
      less: option.less,
      remote: option.remote
    });
    var moduleConfPath = page.destinationPath('module-conf.js');
    var appConfPath = path.join(path.resolve(page.destinationRoot(), '..'), 'app-conf.js');
    if (!fs.existsSync(moduleConfPath)) {
      console.log(chalk.red('  出错了，当前目录没有module-conf.js，请检查当前目录是否是一个模块目录！'));
      return;
    }
    page.create(function () {
      var argv = [].slice.call(arguments);
      var appConf = require(appConfPath);
      var moduleConf = require(moduleConfPath);
      if (appConf) {
        report('page', argv, function (params) {
          params.moduleName = moduleConf.module;
          params.moduleId = moduleConf.moduleId;
          params.appName = appConf.app;
          params.appId = appConf.appId;
          params.page = argv[0];
        }, function (body) {
          if (body && body.no === 0) {
            console.log('success');
          }
        });
      }
    });
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena page shop');
    console.log('    $ athena p shop');
    console.log();
  });

program
  .command('widget [widgetName]')
  .alias('w')
  .option('--name [widgetName]', '组件名称')
  .option('--description [widgetDescription]', '组件描述')
  .option('--sass', '启用sass')
  .option('--less', '启用less')
  .description('创建新的组件')
  .action(function(widgetName, option) {
    var widget = new Widget({
      widgetName: widgetName || option.name,
      description: option.description,
      sass: option.sass,
      less: option.less
    });
    var moduleConfPath = widget.destinationPath('module-conf.js');
    var appConfPath = path.join(path.resolve(widget.destinationRoot(), '..'), 'app-conf.js');
    if (!fs.existsSync(moduleConfPath)) {
      console.log(chalk.red('  出错了，当前目录没有module-conf.js，请检查当前目录是否是一个模块目录！'));
      return;
    }
    widget.create(function () {
      var argv = [].slice.call(arguments);
      var appConf = require(appConfPath);
      var moduleConf = require(moduleConfPath);
      if (appConf) {
        report('widget', argv, function (params) {
          params.moduleName = moduleConf.module;
          params.moduleId = moduleConf.moduleId;
          params.appName = appConf.app;
          params.appId = appConf.appId;
          params.widget = argv[0];
        }, function (body) {
          if (body && body.no === 0) {
            console.log('success');
          }
        });
      }
    });
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena widget topbar');
    console.log('    $ athena w topbar');
    console.log();
  });

program
  .command('build')
  .alias('b')
  .description('编译项目or模块')
  .option('-a, --app [appName]', '编译项目')
  .option('-m, --module [moduleName]', '编译模块', function (val) {
    return val.split(',');
  })
  .option('--verbose', '编译详细信息')
  .option('--pack', '打包功能，输出静态稿')
  .option('--remote [remoteName]', '目标机器，根据app-conf.js中的配置')
  .action(function (option) {
    var app = null;
    var mod = null;
    // 带参数
    if (option) {
      if (typeof option.app === 'string') {
        app = option.app;
      }
      if (option.module && typeof option.module.sort === 'function') {
        mod = option.module;
      }
    }
    builder.build(app, mod, option);
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena build');
    console.log('    $ athena build -a cx');
    console.log('    $ athena build -m tz');
    console.log();
  });

program
  .command('serve')
  .alias('s')
  .description('预览项目or模块')
  .option('-a, --app [appName]', '预览项目')
  .option('-m, --module [moduleName]', '预览模块', function (val) {
    return val.split(',');
  })
  .option('--page [pageName]', '预览页面')
  .option('--verbose', '编译详细信息')
  .option('--dist', '预览经过完整编译流程后的文件')
  .action(function (option) {
    var app = null;
    var mod = null;
    // 带参数
    if (option) {
      if (typeof option.app === 'string') {
        app = option.app;
      }
      if (option.module && typeof option.module.sort === 'function') {
        mod = option.module;
      }
    }
    builder.serve(app, mod, option);
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena serve');
    console.log('    $ athena serve -a cx');
    console.log('    $ athena serve -m tz');
    console.log();
  });

program
  .command('publish')
  .alias('pu')
  .description('发布项目or模块，发布到预览机以及tencent/jd开发机')
  .option('-a, --app [appName]', '发布项目')
  .option('-m, --module [moduleName]', '发布模块', function (val) {
    return val.split(',');
  })
  .option('-n, --noImage', '不发布图片')
  .option('--pack', '打包功能，输出静态稿')
  .option('--verbose', '发布详细信息')
  .action(function (option) {
    var app = null;
    var mod = null;
    // 带参数
    if (option) {
      if (typeof option.app === 'string') {
        app = option.app;
      }
      if (option.module && typeof option.module.sort === 'function') {
        mod = option.module;
      }
    }
    builder.publish(app, mod, option).then(function (argv) {
      var args = argv.files;
      if (argv.appConf) {
        report('publish', args, function (params) {
          params.app = argv.appConf.appId;
        });
      }
    }).catch(function (e) {
      console.log(e.stack);
    });
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena publish');
    console.log('    $ athena publish -a cx');
    console.log('    $ athena publish -m tz');
    console.log();
  });

program
  .command('clone [widget]')
  .description('复制一个widget')
  .option('-f, --from [source]', '来源模块')
  .option('-t, --to [dest]', '目标模块，不写则当前目录')
  .action(function (widget, option) {
    if (widget === undefined) {
      gutil.log(gutil.colors.red('请输入widgetName'));
      return;
    }
    var source = null;
    var dest = null;
    // 带参数
    if (option) {
      if (typeof option.from === 'string') {
        source = option.from;
      }
      if (typeof option.to === 'string') {
        dest = option.to;
      }
    }
    builder.clone(widget, source, dest);
  }).on('--help', function() {
    console.log('  Examples:');
    console.log('');
    console.log('    $ athena clone widgetName');
    console.log('    $ athena clone widgetName --from moduleName');
    console.log('    $ athena clone widgetName --from moduleName --to moduleName');
    console.log();
  });

program
  .command('list-config')
  .description('列出配置项')
  .action(function () {
    var config = Util.getConfig();
    for (var i in config) {
      console.log('  ' + i + '=' + config[i]);
    }
  });

program
  .command('*')
  .action(function () {
    console.log('    ' + chalk.red('没有该命令哟，请通过 athena -h 查看帮助！'));
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
