var Wreck = require('wreck')
var logger = require('winston')
var https = require('https')

function convertError (codes, error, response) {
  if (!error && (response.statusCode < 200 || response.statusCode > 299)) {
    error = new Error(response.statusCode + ' ' + response.statusMessage)
  }

  if (response) {
    if (response.statusCode === 403) {
      error = new Error('Please run this command as root')
    }

    if (codes[response.statusCode]) {
      error = new Error(codes[response.statusCode])
    }
  }

  if (error && error.message.indexOf('socket hang up') !== - 1) {
    error = new Error('Invalid certificate')
    error.code = 'EINVALIDCERT'
  }

  return error
}

function handleResponse (codes, callback, error, response) {
  if (error) {
    error = convertError(codes, error, response)

    return callback(error)
  }

  error = convertError(codes, error, response)

  Wreck.read(response, null, function (bodyError, body) {
    if (!bodyError) {
      if (response.headers['content-type'] && body) {
        if (response.headers['content-type'].indexOf('text/plain') !== -1) {
          body = body.toString()
        } else if (response.headers['content-type'].indexOf('application/json') !== -1) {
          try {
            body = JSON.parse(body)
          } catch (e) {
            bodyError = e
          }
        }
      }
    }

    if (!error && bodyError) {
      error = bodyError
    }

    if (error && body && body.message) {
      logger.debug(body.message)
    }

    callback(error, body)
  })
}

var endStreamMarker = '-----guvnor-stream-end-----'

function handleStreamingResponse (codes, output, callback, error, response) {
  if (error) {
    error = convertError(codes, error, response)

    return callback(error)
  }

  error = convertError(codes, error, response)

  var foundEnd
  var returnArgs = ''

  var buffer = new OutputBuffer(function (line) {
    if (line === endStreamMarker) {
      foundEnd = true
    } else if (foundEnd) {
      returnArgs += line
    } else {
      output(line)
    }
  })

  response.pipe(through2(function (chunk, enc, next) {
    buffer.append(chunk.toString())

    next()
  }, function () {
    buffer.flush()

    var args = [error]

    if (returnArgs.length) {
      args = JSON.parse(returnArgs)

      if (args[0]) {
        var err = args[0]

        args[0] = new Error(err.message)
        args[0].code = err.statusCode
        args[0].error = err.error
      }
    }

    callback.apply(null, args)
  }))
}

module.exports = function daemonRestConnection (keyBundle) {
  var url = process.env.GUVNOR_URL || 'https://localhost:8001'

  // configure wreck
  var wreck = Wreck.defaults({
    baseUrl: url,
    agent: new https.Agent({
      // maxSockets: config.maxSockets,
      // timeout: config.timeout,
      cert: keyBundle.cert,
      key: keyBundle.key,
      ca: keyBundle.ca
    })
  })

  wreck.on('response', function (error, request, response, start, uri) {
    if (error) {
      logger.debug('%s %s error - %s', request.method, uri.href, error.message)
    } else {
      logger.debug('%s %s %d', request.method, uri.href, response.statusCode)
    }
  })

  return {
    url: url,
    request: function (opts, callback) {
      opts = opts || {}
      opts.payload = opts.payload ? {
        payload: JSON.stringify(opts.payload)
      } : {}
      opts.statusMappings = opts.statusMappings || {}

      var responseHandler

      if (opts.output) {
        responseHandler = handleStreamingResponse.bind(null, opts.statusMappings, opts.output, callback)
      } else {
        responseHandler = handleResponse.bind(null, opts.statusMappings, callback)
      }

      wreck.request(opts.method, opts.path, opts.payload, responseHandler)
    }
  }
}