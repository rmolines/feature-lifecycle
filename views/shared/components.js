(function () {
  "use strict";

  // ── Status config ────────────────────────────────────────────────────────
  var STATUS_CONFIG = {
    seed:      { dotClass: "dot-seed",      badgeClass: "badge-seed",      label: "seed" },
    exploring: { dotClass: "dot-exploring", badgeClass: "badge-exploring", label: "exploring" },
    ready:     { dotClass: "dot-ready",     badgeClass: "badge-ready",     label: "ready" },
    planned:   { dotClass: "dot-planned",   badgeClass: "badge-planned",   label: "planned" },
    building:  { dotClass: "dot-building",  badgeClass: "badge-building",  label: "building" },
    done:      { dotClass: "dot-done",      badgeClass: "badge-done",      label: "done" },
    approved:  { dotClass: "dot-approved",  badgeClass: "badge-approved",  label: "approved" },
    shipped:   { dotClass: "dot-shipped",   badgeClass: "badge-shipped",   label: "shipped" },
  };

  var DEFAULT_STATUS = { dotClass: "dot-seed", badgeClass: "badge-seed", label: "unknown" };

  function getStatusConfig(status) {
    return STATUS_CONFIG[status] || DEFAULT_STATUS;
  }

  // ── ARTIFACT_TYPES ────────────────────────────────────────────────────────
  var ARTIFACT_TYPES = ["draft", "prd", "plan", "results", "review"];

  // ── Alpine components ─────────────────────────────────────────────────────

  document.addEventListener("alpine:init", function () {

    // initiativeCard — expandable card for a grouped initiative
    Alpine.data("initiativeCard", function (doc) {
      return {
        doc: doc,
        open: false,

        get status() {
          var key = this.doc.mission + "/" + this.doc.module;
          return Alpine.store("workspace").statusMap[key] || "seed";
        },
        get cfg() { return getStatusConfig(this.status); },
        get dotClass() { return "status-dot " + this.cfg.dotClass; },
        get badgeClass() { return "badge " + this.cfg.badgeClass; },
        get borderClass() { return "border-" + this.status; },
        get statusLabel() { return this.cfg.label; },
        get isShipped() { return this.status === "shipped"; },

        toggle: function () {
          this.open = !this.open;
        },

        get artifacts() {
          return this.doc.artifacts || [];
        },

        get tags() {
          return this.doc.tags || [];
        },

        get title() {
          if (this.doc.data && this.doc.data.id) return this.doc.data.id;
          return this.doc.module || this.doc.slug || "—";
        },

        get problem() {
          if (this.doc.data && this.doc.data.problem) {
            var p = this.doc.data.problem;
            return p.length > 120 ? p.slice(0, 120) + "…" : p;
          }
          return null;
        },
      };
    });

    // tabPanel — reusable tab switching
    Alpine.data("tabPanel", function (tabs, defaultTab) {
      return {
        tabs: tabs || [],
        activeTab: defaultTab || (tabs && tabs.length ? tabs[0] : ""),

        isActive: function (tab) {
          return this.activeTab === tab;
        },

        setTab: function (tab) {
          this.activeTab = tab;
        },
      };
    });

    // cockpitWorkspace — root data store for the cockpit page
    // Groups raw documents by mission/module and fetches derived status
    Alpine.data("cockpitWorkspace", function () {
      return {
        loading: true,
        error: null,
        initiatives: [],       // grouped initiative objects
        activeMission: "all",

        init: function () {
          var self = this;
          this.load();
          // Sync with store when store refreshes
          this.$watch(function () {
            return Alpine.store("workspace").rawDocuments;
          }, function () {
            self.groupAndEnrich();
          });
        },

        load: function () {
          Alpine.store("workspace").refresh();
        },

        groupAndEnrich: function () {
          var store = Alpine.store("workspace");
          var docs = store.rawDocuments || [];
          var grouped = {};

          // Group documents by mission/module
          docs.forEach(function (doc) {
            var key = doc.mission + "/" + doc.module;
            if (!grouped[key]) {
              grouped[key] = {
                mission: doc.mission,
                module: doc.module,
                slug: doc.module,
                documents: {},
                data: {},
                status: "seed",
                artifacts: [],
                tags: [],
              };
            }
            var g = grouped[key];
            var docName = doc.type.replace(".md", "");
            g.documents[docName] = doc;
            // Merge data from draft.md as primary source
            if (doc.type === "draft.md" && doc.data) {
              g.data = doc.data;
              g.tags = doc.data.tags || [];
            }
          });

          var initiatives = Object.values(grouped);

          // Build artifact info for each initiative
          initiatives.forEach(function (init) {
            init.artifacts = ARTIFACT_TYPES.map(function (type) {
              return { type: type, present: !!init.documents[type] };
            });
          });

          this.initiatives = initiatives;
          this.loading = store.loading;

          // Fetch derived status for each initiative into store's reactive statusMap
          var wsStore = Alpine.store("workspace");
          initiatives.forEach(function (init) {
            var key = init.mission + "/" + init.module;
            fetch("/api/initiatives/" + init.mission + "/" + init.module + "/status")
              .then(function (res) { return res.ok ? res.json() : null; })
              .then(function (data) {
                if (data && data.status) {
                  wsStore.statusMap[key] = data.status;
                }
              })
              .catch(function () { /* keep seed as fallback */ });
          });
        },

        get missions() {
          var seen = {};
          var missions = [];
          this.initiatives.forEach(function (init) {
            if (init.mission && !seen[init.mission]) {
              seen[init.mission] = true;
              missions.push(init.mission);
            }
          });
          return missions.sort();
        },

        get filteredInitiatives() {
          var self = this;
          if (this.activeMission === "all") return this.initiatives;
          return this.initiatives.filter(function (init) {
            return init.mission === self.activeMission;
          });
        },

        get statusCounts() {
          var counts = {};
          var map = Alpine.store("workspace").statusMap;
          this.initiatives.forEach(function (init) {
            var key = init.mission + "/" + init.module;
            var s = map[key] || "seed";
            counts[s] = (counts[s] || 0) + 1;
          });
          return counts;
        },

        get totalCount() {
          return this.initiatives.length;
        },

        setMission: function (mission) {
          this.activeMission = mission;
        },

        statusDotClass: function (status) {
          return "status-dot " + getStatusConfig(status).dotClass;
        },
      };
    });
  });

  // ── Alpine store (must be set before alpine:init of components that use it) ──
  document.addEventListener("alpine:init", function () {
    Alpine.store("workspace", {
      rawDocuments: [],
      statusMap: {},
      loading: true,
      error: null,

      refresh: function () {
        var self = this;
        this.loading = true;
        this.error = null;
        fetch("/api/initiatives")
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.json();
          })
          .then(function (data) {
            self.rawDocuments = data.documents || [];
            self.loading = false;
          })
          .catch(function (err) {
            console.error("[workspace] fetch failed:", err);
            self.error = err.message;
            self.loading = false;
          });
      },
    });
  });

  // ── renderBreadcrumb ──────────────────────────────────────────────────────
  // Generates breadcrumb HTML from an array of items.
  // items = [{label, href?}, ...] — last item has no href (current page).
  function renderBreadcrumb(items) {
    return items.map(function (item, i) {
      if (i < items.length - 1) {
        return '<a href="' + (item.href || "#") + '" class="breadcrumb-link">' + item.label + '</a>' +
               '<span class="breadcrumb-sep">›</span>';
      }
      return '<span class="breadcrumb-current">' + item.label + '</span>';
    }).join("");
  }

  // Expose globally so Alpine templates can call renderBreadcrumb(...)
  window.renderBreadcrumb = renderBreadcrumb;

  // Export helpers for external use (e.g. ws-client.js callback)
  window._launchpadComponents = {
    getStatusConfig: getStatusConfig,
    ARTIFACT_TYPES: ARTIFACT_TYPES,
    renderBreadcrumb: renderBreadcrumb,
  };

})();
