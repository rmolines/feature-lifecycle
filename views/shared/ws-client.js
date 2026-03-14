(function () {
  "use strict";

  // --- Status indicator ---
  var indicator = document.createElement("div");
  indicator.id = "_ws_indicator";
  indicator.style.cssText =
    "position:fixed;bottom:12px;right:12px;width:10px;height:10px;" +
    "border-radius:50%;background:#ef4444;z-index:9999;transition:background 0.3s;";
  document.body.appendChild(indicator);

  function setConnected(connected) {
    indicator.style.background = connected ? "#22c55e" : "#ef4444";
  }

  // --- Reconnect logic ---
  var retryDelay = 1000;
  var maxDelay = 10000;
  var ws = null;

  function connect() {
    var url = "ws://" + location.host + "/ws";
    ws = new WebSocket(url);

    ws.addEventListener("open", function () {
      retryDelay = 1000;
      setConnected(true);
    });

    ws.addEventListener("close", function () {
      setConnected(false);
      ws = null;
      setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, maxDelay);
    });

    ws.addEventListener("message", function (event) {
      var data;
      try {
        data = JSON.parse(event.data);
      } catch (_) {
        return;
      }

      if (data && data.type === "refresh") {
        // Alpine integration: call store refresh if available
        if (
          window.Alpine &&
          typeof Alpine.store === "function" &&
          Alpine.store("workspace") &&
          typeof Alpine.store("workspace").refresh === "function"
        ) {
          Alpine.store("workspace").refresh();
        } else {
          location.reload();
        }
      }
    });
  }

  connect();
})();
