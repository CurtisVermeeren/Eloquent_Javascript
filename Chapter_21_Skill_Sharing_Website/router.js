// Exports the router constructor
var Router = module.exports = function() {
  this.routes = [];
};

// Router object allows new handlers to be registed with add
Router.prototype.add = function(method, url, handler) {
  this.routes.push({method: method,
                    url: url,
                    handler: handler});
};

// Can resolve requests
// Will return a boolean if a handler was found
Router.prototype.resolve = function(request, response) {
  var path = require("url").parse(request.url).pathname;

  // Try routes one at a time returning true when a match is found
  return this.routes.some(function(route) {
    var match = route.url.exec(path);
    if (!match || route.method != request.method)
      return false;

    var urlParts = match.slice(1).map(decodeURIComponent);
    route.handler.apply(null, [request, response]
                                .concat(urlParts));
    return true;
  });
};
