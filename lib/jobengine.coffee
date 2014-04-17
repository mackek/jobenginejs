if !window.location?
  Restie = require('../restie')
  
Restie.set(
  urls:
    base: 'http://encoder.rpitv.org/api'
  defaults:
    headers:
      'X-Agent-Id': 1
)

Task = Restie.define('Task',
  actions:
    start: {}
    set_progress:
      params: [
        'progress'
      ]
    finish: {}
    failed: {}
    canceled: {}
)

Agent = Restie.define('Agent',
  actions:
    assign: {path: 'tasks/assign'}
    running: {method: 'GET', path: 'tasks/running'}
    active: {method: 'GET', path: 'tasks/active'}
)
    
class JobEngine
  agent = {}
  @init: (agent_id, callback) ->
    Agent.find_by_id agent_id, (err, _agent) ->
      agent = _agent
      callback(_agent)

if window.location?
  window.JobEngine = JobEngine
else
  module.exports=JobEngine
