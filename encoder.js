
var agent_id = 1;
if (typeof window === 'undefined') {
  var node = true;
  var program = require('commander');
  var JobEngine = require('./dist/jobengine');

  program
  .version('0.0.1')
  .option('-s, --http', 'Enable HTTP interface', false)
  .option('-p, --port', 'Port for HTTP interface', parseInt, 3000)
  .option('-n, --tasks <value>', 'Number of tasks to run concurrently', parseInt, 3)
  .option('-a, --agent <value>', 'Agent ID', parseInt)
  .parse(process.argv);
  agent_id = program.agent
}

var job_engine = JobEngine;
var agent = {};
var tasks = 3
job_engine.init(agent_id,{tasks: tasks}, function(_agent) {
  agent = _agent;
  console.log("Hi");
});







if (program && program.http) {
  var debug = require('debug')('my-application');
  var app = require('./app');

  app.set('port', process.env.PORT || program.port);

  var server = app.listen(app.get('port'), function() {
    debug('Express server listening on port ' + server.address().port);
  });

}
