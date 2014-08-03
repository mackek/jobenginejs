mediainfo = require('mediainfo')
ffmpegCommand = require('fluent-ffmpeg')
filepath = require('path')

class GetMetaDataTask extends EventEmitter
  constructor: (task) ->
    @task = task

  getMetaData: (inputs) ->
    input = inputs.shift()
    console.log("About to run mediainfo with #{input.path}")
    mediainfo(input.path, (err, result) =>
      if !err
        AssetConnector.find_by_id(input.asset_id, (err, asset) =>
          asset.metadata = JSON.stringify(result)
          asset.save( () =>
            if inputs.length > 0
              getMetaData(inputs)
            else
              @emit('finished',{})
          )
        )
      else
        @emit('failed',err)
    )

  run: (callback) ->
    @getMetaData(@task.parameters.inputs)
    callback(false)

  kill: (callback) ->


class EncodingTask extends EventEmitter
  constructor: (task) ->
    @task = task
    @ffmpeg = {}
    @outfiles = []
    @canceling = false
  run: (callback) ->
    MountConnector.where({
        agent_id: options.agent,
        file_store_purpose: 'scratch'
      }, (err,mounts) =>
        if mounts.length > 0
          for output in @task.parameters.outputs
            @outfiles.push({
              parameters: output.parameters,
              file: output.file,
              path: mounts[0].path,
              file_store_id: mounts[0].file_store_id,
              output_config_id: output.config_id
              pass : output.pass
              full_path: if output.file[0] == '/' then output.file else filepath.join(mounts[0].path, output.file)
           })
           @start(callback)
    )
  start: (callback) ->
    params = @task.parameters
    @ffmpeg = ffmpeg = ffmpegCommand()
    for input in params.inputs
      if input.asset_type == "media"
        ffmpeg.input(input.path)
        for param in input.parameters
          option = if param.option[0] == '-' then param.option else '-' + param.option
          ffmpeg.addInputOption(option, param.value)
    for output in @outfiles
      console.log(output)
      ffmpeg.output(output.full_path)

      for param in output.parameters
        option = if param.option[0] == '-' then param.option else '-' + param.option
        ffmpeg.addOutputOption(option, param.value)

    ffmpeg.on('progress', (progress) =>
      console.log("Task #{@task.id}: #{progress.timemark}")
      if progress.percent
        @emit('progress', progress.percent)
    )
    ffmpeg.on('error', (err, stdout, stderr) =>
      if @canceling != false
        @emit('canceled', {})
      else
        @emit('failed', err)
    )
    ffmpeg.on('end', () =>
      first_pass_files_created = false
      for file in @outfiles
        ((file) =>
          if file.pass == 1
            console.log("Creating passfile asset:", file) 
            AssetConnector.create({title: "Task #{@task.id} passfile", asset_type: 'passfile', role: 'temp', 'asset_lists[]':@task.output_asset_list_id}, (err, asset) ->
              FileConnector.create({path: "ffmpeg2pass-0.log", asset_id: asset.id, file_store_id: file.file_store_id}, ()-> )
            )
            if !first_pass_files_created
              first_pass_files_created = true
              AssetListConnector.find_by_id(@task.output_asset_list_id, (err, asset_list) =>
                for input in @task.parameters.inputs
                  if input.asset_type == "media"
                    asset_list.assets(input.asset_id)
              )
          if file.file != '/dev/null'
            AssetConnector.create({title: file.file,output_config_id: file.output_config_id,asset_type: 'media',role: 'stream', 'asset_lists[]':@task.output_asset_list_id}, (err, asset) ->
                FileConnector.create({path: file.file,asset_id: asset.id, file_store_id: file.file_store_id}, () ->)
            )
        )(file)
      console.log("Finished!")
      @emit('finished', {})
    )
    ffmpeg.run()
    callback(false)

  kill: (callback) ->
    @canceling = true
    @ffmpeg.kill()

class MoveFiles extends EventEmitter
