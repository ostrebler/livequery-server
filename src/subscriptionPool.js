const lodash = require('lodash')
const rfc6902 = require('rfc6902')

function SubscriptionPool() {
  this.subscriptions = {}
}

// This function basically tells the server "Ok, the client with that socket listens
// to that query with that id, input, and context and that current output"
SubscriptionPool.prototype.register = function(id, socket, query, input, context, output) {
  this.subscriptions[id] = {
    socket,
    query,
    input,
    context,
    output
  }
}

// This function tells the server "Ok, whoever listened to the query with that id
// doesn't wanna listen anymore"
SubscriptionPool.prototype.unregister = function(id, socket) {
  // This is a safety check to ensure that one cannot cancel a subscription from
  // another client, even with the correct query id
  if(this.subscriptions[id] && this.subscriptions[id].socket === socket)
    delete this.subscriptions[id]
}

// This function tells the server "Ok, the client with that socket disconnected entirely"
SubscriptionPool.prototype.unregisterSocket = function(socket) {
  lodash.keys(this.subscriptions).forEach(id => {
    if(this.subscriptions[id].socket === socket)
      delete this.subscriptions[id]
  })
}

// This function applies a patch to the relevant queries and sends a delta to
// the corresponding clients
SubscriptionPool.prototype.patch = function(query, apply, assert) {
  lodash.forOwn(this.subscriptions, (subscription, id) => {
    if(
      subscription.query === query &&
      (!assert || assert(subscription.input, subscription.context))
    ) {
      const update = apply(subscription.output, subscription.input, subscription.context)
      const delta = rfc6902.createPatch(subscription.output, update)
      if(!lodash.isEmpty(delta)) {
        subscription.output = update
        subscription.socket.emit(`patch/${id}`, delta)
      }
    }
  })
}

module.exports = SubscriptionPool
