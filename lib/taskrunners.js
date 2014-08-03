var EncodingTask, GetMetaDataTask, MoveFiles, ffmpegCommand, filepath, mediainfo,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

mediainfo = require('mediainfo');

ffmpegCommand = require('fluent-ffmpeg');

filepath = require('path');

GetMetaDataTask = (function(_super) {
  __extends(GetMetaDataTask, _super);

  function GetMetaDataTask(task) {
    this.task = task;
  }

  GetMetaDataTask.prototype.getMetaData = function(inputs) {
    var input;
    input = inputs.shift();
    console.log("About to run mediainfo with " + input.path);
    return mediainfo(input.path, (function(_this) {
      return function(err, result) {
        if (!err) {
          return AssetConnector.find_by_id(input.asset_id, function(err, asset) {
            asset.metadata = JSON.stringify(result);
            return asset.save(function() {
              if (inputs.length > 0) {
                return getMetaData(inputs);
              } else {
                return _this.emit('finished', {});
              }
            });
          });
        } else {
          return _this.emit('failed', err);
        }
      };
    })(this));
  };

  GetMetaDataTask.prototype.run = function(callback) {
    this.getMetaData(this.task.parameters.inputs);
    return callback(false);
  };

  GetMetaDataTask.prototype.kill = function(callback) {};

  return GetMetaDataTask;

})(EventEmitter);

EncodingTask = (function(_super) {
  __extends(EncodingTask, _super);

  function EncodingTask(task) {
    this.task = task;
    this.ffmpeg = {};
    this.outfiles = [];
    this.canceling = false;
  }

  EncodingTask.prototype.run = function(callback) {
    return MountConnector.where({
      agent_id: options.agent,
      file_store_purpose: 'scratch'
    }, (function(_this) {
      return function(err, mounts) {
        var output, _i, _len, _ref;
        if (mounts.length > 0) {
          _ref = _this.task.parameters.outputs;
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            output = _ref[_i];
            _this.outfiles.push({
              parameters: output.parameters,
              file: output.file,
              path: mounts[0].path,
              file_store_id: mounts[0].file_store_id,
              output_config_id: output.config_id,
              pass: output.pass,
              full_path: output.file[0] === '/' ? output.file : filepath.join(mounts[0].path, output.file)
            });
          }
          return _this.start(callback);
        }
      };
    })(this));
  };

  EncodingTask.prototype.start = function(callback) {
    var ffmpeg, input, option, output, param, params, _i, _j, _k, _l, _len, _len1, _len2, _len3, _ref, _ref1, _ref2, _ref3;
    params = this.task.parameters;
    this.ffmpeg = ffmpeg = ffmpegCommand();
    _ref = params.inputs;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      input = _ref[_i];
      if (input.asset_type === "media") {
        ffmpeg.input(input.path);
        _ref1 = input.parameters;
        for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
          param = _ref1[_j];
          option = param.option[0] === '-' ? param.option : '-' + param.option;
          ffmpeg.addInputOption(option, param.value);
        }
      }
    }
    _ref2 = this.outfiles;
    for (_k = 0, _len2 = _ref2.length; _k < _len2; _k++) {
      output = _ref2[_k];
      console.log(output);
      ffmpeg.output(output.full_path);
      _ref3 = output.parameters;
      for (_l = 0, _len3 = _ref3.length; _l < _len3; _l++) {
        param = _ref3[_l];
        option = param.option[0] === '-' ? param.option : '-' + param.option;
        ffmpeg.addOutputOption(option, param.value);
      }
    }
    ffmpeg.on('progress', (function(_this) {
      return function(progress) {
        console.log("Task " + _this.task.id + ": " + progress.timemark);
        if (progress.percent) {
          return _this.emit('progress', progress.percent);
        }
      };
    })(this));
    ffmpeg.on('error', (function(_this) {
      return function(err, stdout, stderr) {
        if (_this.canceling !== false) {
          return _this.emit('canceled', {});
        } else {
          return _this.emit('failed', err);
        }
      };
    })(this));
    ffmpeg.on('end', (function(_this) {
      return function() {
        var file, first_pass_files_created, _fn, _len4, _m, _ref4;
        first_pass_files_created = false;
        _ref4 = _this.outfiles;
        _fn = function(file) {
          if (file.pass === 1) {
            console.log("Creating passfile asset:", file);
            AssetConnector.create({
              title: "Task " + _this.task.id + " passfile",
              asset_type: 'passfile',
              role: 'temp',
              'asset_lists[]': _this.task.output_asset_list_id
            }, function(err, asset) {
              return FileConnector.create({
                path: "ffmpeg2pass-0.log",
                asset_id: asset.id,
                file_store_id: file.file_store_id
              }, function() {});
            });
            if (!first_pass_files_created) {
              first_pass_files_created = true;
              AssetListConnector.find_by_id(_this.task.output_asset_list_id, function(err, asset_list) {
                var _len5, _n, _ref5, _results;
                _ref5 = _this.task.parameters.inputs;
                _results = [];
                for (_n = 0, _len5 = _ref5.length; _n < _len5; _n++) {
                  input = _ref5[_n];
                  if (input.asset_type === "media") {
                    _results.push(asset_list.assets(input.asset_id));
                  } else {
                    _results.push(void 0);
                  }
                }
                return _results;
              });
            }
          }
          if (file.file !== '/dev/null') {
            return AssetConnector.create({
              title: file.file,
              output_config_id: file.output_config_id,
              asset_type: 'media',
              role: 'stream',
              'asset_lists[]': _this.task.output_asset_list_id
            }, function(err, asset) {
              return FileConnector.create({
                path: file.file,
                asset_id: asset.id,
                file_store_id: file.file_store_id
              }, function() {});
            });
          }
        };
        for (_m = 0, _len4 = _ref4.length; _m < _len4; _m++) {
          file = _ref4[_m];
          _fn(file);
        }
        console.log("Finished!");
        return _this.emit('finished', {});
      };
    })(this));
    ffmpeg.run();
    return callback(false);
  };

  EncodingTask.prototype.kill = function(callback) {
    this.canceling = true;
    return this.ffmpeg.kill();
  };

  return EncodingTask;

})(EventEmitter);

MoveFiles = (function(_super) {
  __extends(MoveFiles, _super);

  function MoveFiles() {
    return MoveFiles.__super__.constructor.apply(this, arguments);
  }

  return MoveFiles;

})(EventEmitter);
