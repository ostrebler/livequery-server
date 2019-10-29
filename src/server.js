const Io = require('socket.io')
const uuid = require('uuid/v4')
const lodash = require('lodash')
const SubscriptionPool = require('./subscriptionPool')

function Server(config) {
  this.config = {
    path: '/live',
    port: 3000,
    queries: {},
    actions: {},
    context: () => ({}),
    verbose: false,
    io: {},
    ...config
  }

  this.subscriptionPool = new SubscriptionPool()

  // The underlying socket.io server
  new Io(
    this.config.server || this.config.port,
    { path: this.config.path, ...this.config.io }
  ).on('connect', this.handleConnect.bind(this))
}

// This function handles new client connections and listens to new queries, query
// cancellations, actions and disconnection
Server.prototype.handleConnect = function(socket) {
  this.config.verbose && log('New client', socket.id)
  socket.on('query', this.handleQuery.bind(this, socket))
  socket.on('unquery', this.handleUnquery.bind(this, socket))
  socket.on('action', this.handleAction.bind(this, socket))
  socket.on('disconnect', this.handleDisconnect.bind(this, socket))
}

// When a client disconnects, remove all his subscriptions
Server.prototype.handleDisconnect = function(socket) {
  this.subscriptionPool.unregisterSocket(socket)
}

// When a client fires a query...
Server.prototype.handleQuery = function(socket, query, input, context, callback) {
  this.config.verbose && log('New', query, 'query from client', socket.id)
  // ...the complete context is calculated...
  context = {
    ...context,
    ...this.config.context(context, { query, input })
  }
  // ...the query is executed...
  const output = this.config.queries[query](input, context)
  // ...a subscription is created with a unique id...
  const id = uuid()
  this.subscriptionPool.register(id, socket, query, input, context, output)
  // ...and the output is returned to the client
  callback({ id, output })
}

// When a client wants to cancel a subscription, just remove it from the pool
Server.prototype.handleUnquery = function(socket, id) {
  this.subscriptionPool.unregister(id, socket)
}

// When a client fires an action...
Server.prototype.handleAction = function(socket, action, input, context, callback) {
  this.config.verbose && log('New', action, 'action from client', socket.id)
  // ...the complete context is calculated...
  context = {
    ...context,
    ...this.config.context(context, { action, input }),
    patch: this.handlePatch.bind(this, socket, action)
  }
  // ...the action is executed...
  const output = this.config.actions[action](input, context)
  // ...and the output is returned to the client
  callback({ output })
}

// When a patch is triggered within an action, it is sent to the subscription pool
Server.prototype.handlePatch = function(socket, action, query, apply, assert) {
  this.config.verbose && log('New patch on', query, 'triggered by', action, 'from client', socket.id)
  lodash.defer(this.subscriptionPool.patch.bind(this.subscriptionPool), query, apply, assert)
}

const log = args => console.log(
  '[LiveQuery]',
  new Date().toISOString().substring(0, 10),
  ...args
)

module.exports = Server
