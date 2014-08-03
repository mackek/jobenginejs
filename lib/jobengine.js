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
