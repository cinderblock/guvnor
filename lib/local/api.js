'use strict'

const logger = require('winston')
const async = require('async')
const processNameFromScript = require('../common/process-name-from-script')
const socketIOClient = require('socket.io-client')
const daemonRestConnection = require('../common/daemon-rest-connection')

module.exports = function loadApi (keyBundle) {
  return new Promise((resolve, reject) => {
    if (!keyBundle || !keyBundle.cert || !keyBundle.key || !keyBundle.ca) {
      return reject(new Error('No keybundle supplied'))
    }

    const daemon = daemonRestConnection({
      cert: keyBundle.cert,
      key: keyBundle.key,
      ca: keyBundle.ca
    })
    const socket = daemon.url.replace('https', 'wss')

    const request = (options) => {
      return new Promise((resolve, reject) => {
        daemon.request(options, (error, result) => {
          if (error) {
            return reject(error)
          }

          resolve(result)
        })
      })
    }

    logger.debug('Connecting to REST server', daemon.url)
    logger.debug('Connecting to websocket', socket)

    const api = socketIOClient(socket, {
      cert: keyBundle.cert,
      key: keyBundle.key,
      ca: keyBundle.ca,
      forceNew: true
    })

    // api namespaces
    api.app = {

    }
    api.user = {

    }
    api.process = {

    }

    api.app.install = (url, name, output) => {
      return request({
        method: 'POST',
        path: '/apps',
        payload: {
          url: url,
          name: name
        },
        output: output
      })
    }

    api.app.list = () => {
      return request({
        method: 'GET',
        path: '/apps'
      })
    }

    api.app.remove = (name) => {
      return request({
        method: 'DELETE',
        path: `/apps/${name}`,
        statusMappings: {
          404: `No app found for ${name}`
        }
      })
    }

    api.app.ref = (name) => {
      return request({
        method: 'GET',
        path: `/apps/${name}/ref`,
        statusMappings: {
          404: `No app found for ${name}`
        }
      })
    }

    api.app.refs = (name) => {
      return request({
        method: 'GET',
        path: `/apps/${name}/refs`,
        statusMappings: {
          404: `No app found for ${name}`
        }
      })
    }

    api.app.update = (name, output) => {
      return request({
        method: 'PUT',
        path: `/apps/${name}/refs`,
        output: output,
        statusMappings: {
          404: `No app found for ${name}`
        }
      })
    }

    api.app.setRef = (name, ref, output) => {
      return request({
        method: 'PATCH',
        path: `/apps/${name}`,
        output: output,
        payload: {
          ref: ref
        },
        statusMappings: {
          404: `No app found for ${name}`
        }
      })
    }

    api.user.add = (name) => {
      return request({
        method: 'POST',
        path: '/certificates/user',
        payload: {
          user: name
        },
        statusMappings: {
          409: `A certificate already exists for that user, please remove it with 'guv user rm ${name}' first`,
          412: 'That user does not exist'
        }
      })
    }

    api.user.remove = (name) => {
      return request({
        method: 'DELETE',
        path: '/certificates/user',
        payload: {
          user: name
        }
      })
    }

    api.process.get = (name) => {
      return request({
        method: 'GET',
        path: `/processes/${name}`
      })
    }

    api.process.list = () => {
      return request({
        method: 'GET',
        path: '/processes'
      })
    }

    api.process.start = (script, options) => {
      options.script = script

      const name = processNameFromScript(options.name || options.script)

      delete options.name

      logger.debug(`Starting process ${name}`)

      return api.process.get(name)
      .then((process) => {
        if (!process) {
          logger.debug(`Process ${name} did not exist, will create it`)

          return request({
            method: 'POST',
            path: `/processes/${name}`,
            payload: options
          })
        }
      })
      .then(() => request({
        method: 'PATCH',
        path: `/processes/${name}`,
        payload: {
          status: 'start'
        },
        statusMappings: {
          '409': `${name} is already running`
        }
      }))
    }

    api.process.stop = (name) => {
      return request({
        method: 'PATCH',
        path: `/processes/${name}`,
        payload: {
          status: 'stop'
        },
        statusMappings: {
          409: `${name} is not running`
        }
      })
    }

    api.process.remove = (script) => {
      return request({
        method: 'DELETE',
        path: `/processes/${script}`,
        statusMappings: {
          404: `No process found for ${script}`
        }
      })
    }

    api.process.gc = (script) => {
      return request({
        method: 'POST',
        path: `/processes/${script}/gc`,
        statusMappings: {
          404: `No process found for ${script}`
        }
      })
    }

    api.process.takeHeapSnapshot = (script) => {
      return request({
        method: 'POST',
        path: `/processes/${script}/heapsnapshots`,
        statusMappings: {
          404: `No process found for ${script}`
        }
      })
    }

    api.process.removeHeapSnapshot = (script, id) => {
      return request({
        method: 'DELETE',
        path: `/processes/${script}/heapsnapshots/${id}`,
        statusMappings: {
          404: `No process found for ${script}`
        }
      })
    }

    api.process.getHeapSnapshot = (script, id) => {
      return request({
        method: 'GET',
        path: `/processes/${script}/heapsnapshots/${id}`,
        statusMappings: {
          404: `No process found for ${script}`
        }
      })
    }

    api.process.logs = (script) => {
      return request({
        method: 'GET',
        path: `/processes/${script}/logs`,
        statusMappings: {
          404: `No process found for ${script}`
        }
      })
    }

    api.on('connect', () => {
      logger.debug('Connected to websocket')
      logger.debug('resolve', typeof resolve)

      if (resolve) {
        resolve(api)
        resolve = null
        reject = null
      }
    })
    api.on('error', (error) => {
      logger.error('Error connecting to websocket', error)

      if (reject) {
        api.disconnect()
        api.close()
        reject(error)
        resolve = null
        reject = null

        return
      }
    })
    api.on('disconnect', () => {
      logger.debug('Websocket disconnect')
    })
    api.on('reconnect', (attempt) => {
      logger.debug(`Websocket reconnect #${attempt}`)
    })
    api.on('reconnect_attempt', () => {
      logger.debug('Websocket reconnect attempt')
    })
    api.on('reconnecting', (attempt) => {
      logger.debug(`Websocket reconnecting #${attempt}`)
    })
    api.on('reconnect_error', (error) => {
      logger.debug(`Websocket reconnect error ${error.description} ${error.type}`)

      // find out what really happened
      if (this.io.engine.transport.polling) {
        logger.debug('Websocket is polling')
        const xhrError = this.io.engine.transport.pollXhr.xhr.statusText

        if (xhrError instanceof Error) {
          logger.debug('Found xhr error on websocket')
          error = xhrError
        }
      }

      if (error.message.indexOf('socket hang up') !== -1) {
        error = new Error('Invalid certificate')
        error.code = 'EINVALIDCERT'
      }

      api.emit('error', error)
    })
    api.on('reconnect_failed', () => {
      logger.debug('Websocket reconnect failed')
    })

    api.on('*', (event) => {
      logger.debug(`Incoming event ${event}`)
    })
  })
}