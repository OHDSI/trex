/**
 * DevX RPC Bridge — iframe-side
 * Provides a promise-based RPC layer over postMessage.
 * Injected into the user's app iframe via proxy alongside selector_client.js and visual_editor_client.js.
 *
 * Parent calls methods on the iframe by sending: { __devx_rpc: true, id, method, args }
 * Iframe responds with: { __devx_rpc_reply: true, id, result } or { __devx_rpc_reply: true, id, error }
 *
 * Register handlers via window.__devxRpc.register(name, fn)
 */
(function () {
  "use strict";

  var handlers = {};
  var callIdCounter = 0;
  var pendingCalls = {};

  /**
   * Register an RPC handler callable from the parent.
   * @param {string} name - Method name
   * @param {Function} fn - Handler function (may return a value or Promise)
   */
  function register(name, fn) {
    handlers[name] = fn;
  }

  /**
   * Call an RPC method on the parent (iframe → parent direction).
   * @param {string} method - Method name
   * @param {...*} args - Arguments
   * @returns {Promise<*>} Result from parent
   */
  function call(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    var id = "__devx_rpc_" + (++callIdCounter);
    return new Promise(function (resolve, reject) {
      pendingCalls[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage(
        { __devx_rpc: true, id: id, method: method, args: args },
        "*"
      );
      // Timeout after 10s
      setTimeout(function () {
        if (pendingCalls[id]) {
          delete pendingCalls[id];
          reject(new Error("RPC timeout: " + method));
        }
      }, 10000);
    });
  }

  // Listen for incoming RPC calls from parent and replies to our calls
  window.addEventListener("message", function (e) {
    if (!e.data || e.source !== window.parent) return;

    // Incoming RPC call from parent
    if (e.data.__devx_rpc === true) {
      var id = e.data.id;
      var method = e.data.method;
      var args = e.data.args || [];
      var handler = handlers[method];

      if (!handler) {
        window.parent.postMessage(
          { __devx_rpc_reply: true, id: id, error: "Unknown method: " + method },
          "*"
        );
        return;
      }

      try {
        var result = handler.apply(null, args);
        Promise.resolve(result).then(
          function (res) {
            window.parent.postMessage(
              { __devx_rpc_reply: true, id: id, result: res },
              "*"
            );
          },
          function (err) {
            window.parent.postMessage(
              { __devx_rpc_reply: true, id: id, error: String(err) },
              "*"
            );
          }
        );
      } catch (err) {
        window.parent.postMessage(
          { __devx_rpc_reply: true, id: id, error: String(err) },
          "*"
        );
      }
    }

    // Reply to our outgoing RPC call
    if (e.data.__devx_rpc_reply === true && pendingCalls[e.data.id]) {
      var pending = pendingCalls[e.data.id];
      delete pendingCalls[e.data.id];
      if (e.data.error) {
        pending.reject(new Error(e.data.error));
      } else {
        pending.resolve(e.data.result);
      }
    }
  });

  // Expose globally so other iframe scripts can register handlers
  window.__devxRpc = {
    register: register,
    call: call,
  };
})();
