options = {tasks: 3, agent: 1}
if typeof window == 'undefined'
  Restie = require('../restie')
  {EventEmitter} = require('events')
else
  vals = window.location.hash.substring(1).split(",")
  for val in vals
    split = val.split("=")
    options[split[0]] = split[1]


Restie.set(
  urls:
    base: 'http://encoder.rpitv.org/api'
  defaults:
    headers:
      'X-Agent-Id': options.agent
  after: (err, res, body, callback) ->
    if body.tasks
      JobEngine.lastUpdate = Date.now()
      JobEngine.updateTasks(body.tasks)
    if body.response
      callback(err, res, body.response)
    else
      callback(err, res, body)
)
Agent = Restie.define('Agent',null,
  actions:
    assign: {path: 'tasks/assign'}
    running: {method: 'GET', path: 'tasks/running'}
    active: {method: 'GET', path: 'tasks/active'}
    ping: {}
)
TaskConnector = Restie.define('Task',null,
  actions:
    start: {}
    set_progress:
      params: [
        'progress',
        'detailed'
      ]
    finish: {}
    failed: {}
    canceled: {}
    restarted: {}
)
AssetConnector = Restie.define('Asset',null,)
FileConnector = Restie.define('File',null,)
AssetListConnector = Restie.define('Asset_List',null,
  actions:
    assets: { method: 'POST', params: ['asset_id'] }
)
MountConnector = Restie.define('Mount',null,)

class FakeTaskRunner extends EventEmitter
  constructor: () ->
    @timer = 0
    @progress = 0
  run: (callback) =>
    if @timer != 0
      clearInterval(@timer)
      console.log("Error. Called run with existing timer")
    @timer = setInterval( ( () => @tick()), 2000)
    callback(false)

  tick: () =>
    @progress += 5
    @emit('progress', [@progress])
    if @progress >= 100
      clearInterval(@timer)
      @emit('finished',{})
  kill: (callback) ->
    clearInterval(@timer)
    @progress = 0
    @emit('killed',{})
    callback()
    


class Task extends EventEmitter
  _cb: (callback) ->
    (err, res, body) =>
      if err
        console.log("Error while making request! Eeek", res)
      else if !body || !body.state
        console.log("No state returned")
      else
        @updateTask(body)
        if callback
          callback(body)
  constructor: (connector) ->
    @connector = connector
    for own property, value of connector
      if typeof(value) != 'function'
        @[property] = value
    @locked = false
    if @state == 'running' # new task should not already be running, it must have failed
      @restart()
    if @state == 'canceling'
      @cancel()
    @lastProgress = 0


  cancel: () ->
    console.log("Canceling task #{@id}")
    if @setState('canceling')
      if @taskRunner
        @taskRunner.kill()
      else
        @canceled()
  canceled: () ->
    @setState('canceled')
    @connector.canceled( @_cb() )

  restart: () ->
    @setState('canceling')
    console.log("Restarting task #{@id}")
    @connector.restarted( @_cb( ) )

  run: () ->
    console.log("Running task #{@id}")
    if @setState('running')
      @initTaskRunner()
      @taskRunner.run( () =>
        @connector.start( @_cb( ) ) 
      )
    else
      console.log("Unable to run task in current state")
  finished: () ->
    console.log("Finished task #{@id}")
    if @setState('finished')
      @connector.finish( @_cb() )

  failed: (err) ->
    console.log("Failed with error: #{err}")
    if @setState('failed')
      @connector.failed( @_cb() ) 

  checkState: (state) ->
    switch state
      when 'running'
        return true if @state == 'assigned'
      when 'finished'
        return true if @state == 'running'
      when 'canceling'
        return true if @state == 'running' or @state == 'assigned'
      when 'canceled'
        return true if @state == 'canceling'
      when 'failed'
        return true if @state == 'running' or @state == 'assigned'
      when 'assigned'
        return true if @state == 'canceling' or @state == 'canceled' or @state == 'failed' or @state == 'queued'
      when 'queued'
        return true if @state == 'canceling' or @state == 'canceled' or @state == 'running'
    return false

  setState: (state) ->
    console.log("Task #{@id}: Changing state from #{@state} to #{state}", @checkState(state))
    if @checkState(state) 
      @state = state
      return true
    return false

  updateTask: (task) ->
    if (task.state != @state)
      switch task.state
        when 'canceling' then @cancel()
        when 'canceled' then @setState('canceled')
        when 'finished' then @setState('finished')
        when 'assigned' then @setState('assigned')
        when 'running' then @run()
        when 'failed' then @setState('failed')
        when 'queued' then @setState('queued')

  initTaskRunner: () ->
    switch @task_type
      when 'GetMetadata'
        @taskRunner = new GetMetaDataTask(@)
      when 'EncodingTask'
        @taskRunner = new EncodingTask(@)
      else
        @taskRunner = new FakeTaskRunner()
    @taskRunner.addListener('canceled', () =>
      @canceled()
    )
    @taskRunner.addListener('progress', (progress, detailed) =>
      if @lastProgress + 5000 < Date.now()
        @lastProgress = Date.now()
        @connector.set_progress(progress, detailed)
      @progress = progress
    )
    @taskRunner.addListener('finished', (event) =>
      @finished()
    )
    @taskRunner.addListener('failed', (event) =>
      @failed()
    )

class Queue
  constructor: () ->
    states.map (state) =>
      Object.defineProperty(@, state, {
        get: () ->
          list = []
          for own id, task of @
            if task instanceof(Task)
              if task.state == state
                list.push(task)
          list
      })

  states = ['task_created', 'queued', 'assigned', 'running', 'canceled', 'canceling', 'finished', 'failed']
  addTask: (task) ->
    @[task.id] = task
    @process()
  getTask: (id) ->
    @[id]
  process: () ->
    list = (arr) -> 
      arr.map((t) -> t.id)
    console.log('assigned:', list(@assigned),
      'queued:', list(@queued),
      'running:',list(@running),
      'finished:',list(@finished))
    if @running.length < options.tasks and @assigned.length > 0
      @assigned[0].run()

class JobEngine
  agent = {}
  @queue = new Queue()
  @init: (agent_id, opt, callback) ->
    Agent.find_by_id options.agent, (err, _agent) ->
      agent = _agent
      options.tasks = agent.max_tasks
      callback(_agent)
    setInterval( ( () =>
      if agent and @lastUpdate + 5000 < Date.now()
        agent.ping()
    ) , 31000)

    setInterval( ( () =>
      @queue.process()
      if @queue.assigned.length < 1
        agent.assign()
    ), 5000)


  @getTask: (id) ->
    TaskConnector.findById(id, (err, _task) =>
      @queue.addTask(new Task(_task))
    )
  @updateTasks: (_tasks) ->
    for task in _tasks
      if !@queue.getTask(task.id)
        console.log("New task I don't know about: #{task.id}. State: #{task.state}")
        @getTask(task.id)
      else
        @queue.getTask(task.id).updateTask(task)


if typeof window == 'undefined'
  window.JobEngine = JobEngine
else
  module.exports=JobEngine
