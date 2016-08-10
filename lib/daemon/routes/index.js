'use strict'

const async = require('async')

module.exports = function routes (server, callback) {
  const tasks = [
    './certificates/ca/get',
    './certificates/user/delete',
    './certificates/user/post',
    './apps/get',
    './apps/post',
    './apps/name/delete',
    './apps/name/patch',
    './apps/name/ref/get',
    './apps/name/refs/get',
    './apps/name/refs/put',
    './get',
    './processes/get',
    './processes/name/delete',
    './processes/name/get',
    './processes/name/patch',
    './processes/name/post',
    './processes/name/events/post',
    './processes/name/exceptions/get',
    './processes/name/exceptions/delete',
    './processes/name/exceptions/by-id/delete',
    './processes/name/gc/post',
    './processes/name/heapsnapshot/get',
    './processes/name/heapsnapshot/post',
    './processes/name/heapsnapshot/delete',
    './processes/name/heapsnapshot/id/delete',
    './processes/name/heapsnapshot/id/get',
    './processes/name/logs/get',
    './users/get'
  ].map((routePath) => {
    return (next) => {
      require(routePath)(server, next)
    }
  })

  async.parallel(tasks, callback)
}