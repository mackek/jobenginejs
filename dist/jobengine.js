/*! jobengine - v0.0.1 - 2014-04-16
* Copyright (c) 2014 Kyle Mackenzie; Licensed MIT */

var Agent, JobEngine, Restie, Task;

if (window.location == null) {
  Restie = require('../restie');
}

Restie.set({
  urls: {
    base: 'http://encoder.rpitv.org/api'
  },
  defaults: {
    headers: {
      'X-Agent-Id': 1
    }
  }
});

Task = Restie.define('Task', {
  actions: {
    start: {},
    set_progress: {
      params: ['progress']
    },
    finish: {},
    failed: {},
    canceled: {}
  }
});

Agent = Restie.define('Agent', {
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
    }
  }
});

JobEngine = (function() {
  var agent;

  function JobEngine() {}

  agent = {};

  JobEngine.init = function(agent_id, callback) {
    return Agent.find_by_id(agent_id, function(err, _agent) {
      agent = _agent;
      return callback(_agent);
    });
  };

  return JobEngine;

})();

if (window.location != null) {
  window.JobEngine = JobEngine;
} else {
  module.exports = JobEngine;
}
