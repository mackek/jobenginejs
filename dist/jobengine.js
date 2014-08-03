/*! jobengine - v0.0.1 - 2014-08-01
* Copyright (c) 2014 Kyle Mackenzie; Licensed MIT */

(function(e){"use strict";function t(){}function i(e,t){if(r)return t.indexOf(e);var n=t.length;while(n--)if(t[n]===e)return n;return-1}var n=t.prototype,r=Array.prototype.indexOf?!0:!1;n.getListeners=function(e){var t=this._events||(this._events={});return t[e]||(t[e]=[])},n.addListener=function(e,t){var n=this.getListeners(e);return i(t,n)===-1&&n.push(t),this},n.on=n.addListener,n.removeListener=function(e,t){var n=this.getListeners(e),r=i(t,n);return r!==-1&&(n.splice(r,1),n.length===0&&(this._events[e]=null)),this},n.off=n.removeListener,n.addListeners=function(e,t){return this.manipulateListeners(!1,e,t)},n.removeListeners=function(e,t){return this.manipulateListeners(!0,e,t)},n.manipulateListeners=function(e,t,n){var r,i,s=e?this.removeListener:this.addListener,o=e?this.removeListeners:this.addListeners;if(typeof t=="object")for(r in t)t.hasOwnProperty(r)&&(i=t[r])&&(typeof i=="function"?s.call(this,r,i):o.call(this,r,i));else{r=n.length;while(r--)s.call(this,t,n[r])}return this},n.removeEvent=function(e){return e?this._events[e]=null:this._events=null,this},n.emitEvent=function(e,t){var n=this.getListeners(e),r=n.length,i;while(r--)i=t?n[r].apply(null,t):n[r](),i===!0&&this.removeListener(e,n[r]);return this},n.trigger=n.emitEvent,typeof define=="function"&&define.amd?define(function(){return t}):e.EventEmitter=t})(this);
var Agent, AssetConnector, AssetListConnector, EventEmitter, FakeTaskRunner, FileConnector, JobEngine, MountConnector, Queue, Restie, Task, TaskConnector, options, split, val, vals, _i, _len,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

options = {
  tasks: 3,
  agent: 1
};

if (typeof window === 'undefined') {
  Restie = require('../restie');
  EventEmitter = require('events').EventEmitter;
} else {
  vals = window.location.hash.substring(1).split(",");
  for (_i = 0, _len = vals.length; _i < _len; _i++) {
    val = vals[_i];
    split = val.split("=");
    options[split[0]] = split[1];
  }
}

Restie.set({
  urls: {
    base: 'http://encoder.rpitv.org/api'
  },
  defaults: {
    headers: {
      'X-Agent-Id': options.agent
    }
  },
  after: function(err, res, body, callback) {
    if (body.tasks) {
      JobEngine.lastUpdate = Date.now();
      JobEngine.updateTasks(body.tasks);
    }
    if (body.response) {
      return callback(err, res, body.response);
    } else {
      return callback(err, res, body);
    }
  }
});

Agent = Restie.define('Agent', null, {
  actions: {
    assign: {
      path: 'tasks/assign'
    },
    running: {
      method: 'GET',
      path: 'tasks/running'
    },
    active: {
      method: 'GET',
      path: 'tasks/active'
    },
    ping: {}
  }
});

TaskConnector = Restie.define('Task', null, {
  actions: {
    start: {},
    set_progress: {
      params: ['progress', 'detailed']
    },
    finish: {},
    failed: {},
    canceled: {},
    restarted: {}
  }
});

AssetConnector = Restie.define('Asset', null);

FileConnector = Restie.define('File', null);

AssetListConnector = Restie.define('Asset_List', null, {
  actions: {
    assets: {
      method: 'POST',
      params: ['asset_id']
    }
  }
});

MountConnector = Restie.define('Mount', null);

FakeTaskRunner = (function(_super) {
  __extends(FakeTaskRunner, _super);

  function FakeTaskRunner() {
    this.tick = __bind(this.tick, this);
    this.run = __bind(this.run, this);
    this.timer = 0;
    this.progress = 0;
  }

  FakeTaskRunner.prototype.run = function(callback) {
    if (this.timer !== 0) {
      clearInterval(this.timer);
      console.log("Error. Called run with existing timer");
    }
    this.timer = setInterval(((function(_this) {
      return function() {
        return _this.tick();
      };
    })(this)), 2000);
    return callback(false);
  };

  FakeTaskRunner.prototype.tick = function() {
    this.progress += 5;
    this.emit('progress', [this.progress]);
    if (this.progress >= 100) {
      clearInterval(this.timer);
      return this.emit('finished', {});
    }
  };

  FakeTaskRunner.prototype.kill = function(callback) {
    clearInterval(this.timer);
    this.progress = 0;
    this.emit('killed', {});
    return callback();
  };

  return FakeTaskRunner;

})(EventEmitter);

Task = (function(_super) {
  __extends(Task, _super);

  Task.prototype._cb = function(callback) {
    return (function(_this) {
      return function(err, res, body) {
        if (err) {
          return console.log("Error while making request! Eeek", res);
        } else if (!body || !body.state) {
          return console.log("No state returned");
        } else {
          _this.updateTask(body);
          if (callback) {
            return callback(body);
          }
        }
      };
    })(this);
  };

  function Task(connector) {
    var property, value;
    this.connector = connector;
    for (property in connector) {
      if (!__hasProp.call(connector, property)) continue;
      value = connector[property];
      if (typeof value !== 'function') {
        this[property] = value;
      }
    }
    this.locked = false;
    if (this.state === 'running') {
      this.restart();
    }
    if (this.state === 'canceling') {
      this.cancel();
    }
    this.lastProgress = 0;
  }

  Task.prototype.cancel = function() {
    console.log("Canceling task " + this.id);
    if (this.setState('canceling')) {
      if (this.taskRunner) {
        return this.taskRunner.kill();
      } else {
        return this.canceled();
      }
    }
  };

  Task.prototype.canceled = function() {
    this.setState('canceled');
    return this.connector.canceled(this._cb());
  };

  Task.prototype.restart = function() {
    this.setState('canceling');
    console.log("Restarting task " + this.id);
    return this.connector.restarted(this._cb());
  };

  Task.prototype.run = function() {
    console.log("Running task " + this.id);
    if (this.setState('running')) {
      this.initTaskRunner();
      return this.taskRunner.run((function(_this) {
        return function() {
          return _this.connector.start(_this._cb());
        };
      })(this));
    } else {
      return console.log("Unable to run task in current state");
    }
  };

  Task.prototype.finished = function() {
    console.log("Finished task " + this.id);
    if (this.setState('finished')) {
      return this.connector.finish(this._cb());
    }
  };

  Task.prototype.failed = function(err) {
    console.log("Failed with error: " + err);
    if (this.setState('failed')) {
      return this.connector.failed(this._cb());
    }
  };

  Task.prototype.checkState = function(state) {
    switch (state) {
      case 'running':
        if (this.state === 'assigned') {
          return true;
        }
        break;
      case 'finished':
        if (this.state === 'running') {
          return true;
        }
        break;
      case 'canceling':
        if (this.state === 'running' || this.state === 'assigned') {
          return true;
        }
        break;
      case 'canceled':
        if (this.state === 'canceling') {
          return true;
        }
        break;
      case 'failed':
        if (this.state === 'running' || this.state === 'assigned') {
          return true;
        }
        break;
      case 'assigned':
        if (this.state === 'canceling' || this.state === 'canceled' || this.state === 'failed' || this.state === 'queued') {
          return true;
        }
        break;
      case 'queued':
        if (this.state === 'canceling' || this.state === 'canceled' || this.state === 'running') {
          return true;
        }
    }
    return false;
  };

  Task.prototype.setState = function(state) {
    console.log("Task " + this.id + ": Changing state from " + this.state + " to " + state, this.checkState(state));
    if (this.checkState(state)) {
      this.state = state;
      return true;
    }
    return false;
  };

  Task.prototype.updateTask = function(task) {
    if (task.state !== this.state) {
      switch (task.state) {
        case 'canceling':
          return this.cancel();
        case 'canceled':
          return this.setState('canceled');
        case 'finished':
          return this.setState('finished');
        case 'assigned':
          return this.setState('assigned');
        case 'running':
          return this.run();
        case 'failed':
          return this.setState('failed');
        case 'queued':
          return this.setState('queued');
      }
    }
  };

  Task.prototype.initTaskRunner = function() {
    switch (this.task_type) {
      case 'GetMetadata':
        this.taskRunner = new GetMetaDataTask(this);
        break;
      case 'EncodingTask':
        this.taskRunner = new EncodingTask(this);
        break;
      default:
        this.taskRunner = new FakeTaskRunner();
    }
    this.taskRunner.addListener('canceled', (function(_this) {
      return function() {
        return _this.canceled();
      };
    })(this));
    this.taskRunner.addListener('progress', (function(_this) {
      return function(progress, detailed) {
        if (_this.lastProgress + 5000 < Date.now()) {
          _this.lastProgress = Date.now();
          _this.connector.set_progress(progress, detailed);
        }
        return _this.progress = progress;
      };
    })(this));
    this.taskRunner.addListener('finished', (function(_this) {
      return function(event) {
        return _this.finished();
      };
    })(this));
    return this.taskRunner.addListener('failed', (function(_this) {
      return function(event) {
        return _this.failed();
      };
    })(this));
  };

  return Task;

})(EventEmitter);

Queue = (function() {
  var states;

  function Queue() {
    states.map((function(_this) {
      return function(state) {
        return Object.defineProperty(_this, state, {
          get: function() {
            var id, list, task;
            list = [];
            for (id in this) {
              if (!__hasProp.call(this, id)) continue;
              task = this[id];
              if (task instanceof Task) {
                if (task.state === state) {
                  list.push(task);
                }
              }
            }
            return list;
          }
        });
      };
    })(this));
  }

  states = ['task_created', 'queued', 'assigned', 'running', 'canceled', 'canceling', 'finished', 'failed'];

  Queue.prototype.addTask = function(task) {
    this[task.id] = task;
    return this.process();
  };

  Queue.prototype.getTask = function(id) {
    return this[id];
  };

  Queue.prototype.process = function() {
    var list;
    list = function(arr) {
      return arr.map(function(t) {
        return t.id;
      });
    };
    console.log('assigned:', list(this.assigned), 'queued:', list(this.queued), 'running:', list(this.running), 'finished:', list(this.finished));
    if (this.running.length < options.tasks && this.assigned.length > 0) {
      return this.assigned[0].run();
    }
  };

  return Queue;

})();

JobEngine = (function() {
  var agent;

  function JobEngine() {}

  agent = {};

  JobEngine.queue = new Queue();

  JobEngine.init = function(agent_id, opt, callback) {
    Agent.find_by_id(options.agent, function(err, _agent) {
      agent = _agent;
      options.tasks = agent.max_tasks;
      return callback(_agent);
    });
    setInterval(((function(_this) {
      return function() {
        if (agent && _this.lastUpdate + 5000 < Date.now()) {
          return agent.ping();
        }
      };
    })(this)), 31000);
    return setInterval(((function(_this) {
      return function() {
        _this.queue.process();
        if (_this.queue.assigned.length < 1) {
          return agent.assign();
        }
      };
    })(this)), 5000);
  };

  JobEngine.getTask = function(id) {
    return TaskConnector.findById(id, (function(_this) {
      return function(err, _task) {
        return _this.queue.addTask(new Task(_task));
      };
    })(this));
  };

  JobEngine.updateTasks = function(_tasks) {
    var task, _j, _len1, _results;
    _results = [];
    for (_j = 0, _len1 = _tasks.length; _j < _len1; _j++) {
      task = _tasks[_j];
      if (!this.queue.getTask(task.id)) {
        console.log("New task I don't know about: " + task.id + ". State: " + task.state);
        _results.push(this.getTask(task.id));
      } else {
        _results.push(this.queue.getTask(task.id).updateTask(task));
      }
    }
    return _results;
  };

  return JobEngine;

})();

if (typeof window === 'undefined') {
  window.JobEngine = JobEngine;
} else {
  module.exports = JobEngine;
}

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
