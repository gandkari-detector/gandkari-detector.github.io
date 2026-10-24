/* Bump Atlas hotspot map. MapLibre loads only when a [data-hotmap] box nears the viewport.
 * The data is generated sample data, labelled as such on the page. When the Atlas backend
 * is live, replace sampleData() with a fetch of its aggregated road segments. */
(function () {
  "use strict";

  var boxes = document.querySelectorAll("[data-hotmap]");
  if (!boxes.length || !("IntersectionObserver" in window)) return;

  var MAPLIBRE = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl";
  var STYLE = "https://tiles.openfreemap.org/styles/positron";
  var LEVELS = ["", "Halka jhatka", "Chai spiller", "Spine adjuster", "Suspension ka antim sanskar"];

  /* Cities the sample scatters bumps around: [lng, lat, weight]. */
  var CITIES = [
    [77.21, 28.61, 1.0], [72.88, 19.08, 1.0], [77.59, 12.97, 0.9], [88.36, 22.57, 0.8],
    [80.27, 13.08, 0.7], [78.49, 17.39, 0.7], [73.86, 18.52, 0.6], [80.95, 26.85, 0.6],
    [75.79, 26.91, 0.5], [85.14, 25.59, 0.6], [79.09, 21.15, 0.5], [91.74, 26.14, 0.4],
    [72.57, 23.02, 0.6], [76.27, 9.93, 0.4], [75.86, 30.9, 0.4], [83.0, 25.32, 0.5]
  ];

  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function sampleData() {
    var r = rng(42);
    var features = [];
    CITIES.forEach(function (c) {
      var n = Math.round(60 * c[2]);
      for (var i = 0; i < n; i++) {
        var a = r() * Math.PI * 2;
        var d = Math.pow(r(), 1.8) * 0.35;
        var level = 1 + Math.min(3, Math.floor(Math.pow(r(), 1.6) * 4));
        features.push({
          type: "Feature",
          properties: { level: level, hits: 3 + Math.floor(r() * 120) },
          geometry: { type: "Point", coordinates: [c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d * 0.8] }
        });
      }
    });
    return { type: "FeatureCollection", features: features };
  }

  var loading = null;
  function loadLib() {
    if (window.maplibregl) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = MAPLIBRE + ".css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = MAPLIBRE + ".js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return loading;
  }

  function mount(box) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var holder = document.createElement("div");
    holder.className = "hotmap-canvas";
    box.appendChild(holder);

    var start = box.clientWidth < 500 ? 3.3 : 3.9;
    var map = new window.maplibregl.Map({
      container: holder,
      style: STYLE,
      center: [79.5, 22.5],
      zoom: start,
      minZoom: 3,
      maxZoom: 13,
      maxBounds: [[60, 3], [100, 38]],
      attributionControl: { compact: true },
      cooperativeGestures: true,
      fadeDuration: reduce ? 0 : 300
    });
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", function () {
      map.addSource("bumps", { type: "geojson", data: sampleData() });

      map.addLayer({
        id: "heat",
        type: "heatmap",
        source: "bumps",
        maxzoom: 11,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "level"], 1, 0.25, 4, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.35, 10, 1.6],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 16, 7, 30, 10, 40],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.9, 11, 0],
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(246,194,28,0)", 0.2, "rgba(246,194,28,.55)", 0.5, "#F6C21C",
            0.75, "#E8590C", 1, "#A61E0A"]
        }
      });

      map.addLayer({
        id: "spots",
        type: "circle",
        source: "bumps",
        minzoom: 7,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "level"], 1, 5, 4, 11],
          "circle-color": ["match", ["get", "level"], 1, "#F6C21C", 2, "#F59F00", 3, "#E8590C", "#26272A"],
          "circle-stroke-color": "#F1EEE4",
          "circle-stroke-width": 2,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 8.5, 1],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 8.5, 1]
        }
      });

      var popup = new window.maplibregl.Popup({ closeButton: false, offset: 12, className: "hotmap-pop" });
      map.on("click", "spots", function (e) {
        var p = e.features[0].properties;
        popup.setLngLat(e.features[0].geometry.coordinates)
          .setHTML("<b>Level " + p.level + ": " + LEVELS[p.level] + "</b><span>" + p.hits + " hits (sample)</span>")
          .addTo(map);
      });
      map.on("mouseenter", "spots", function () { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "spots", function () { map.getCanvas().style.cursor = ""; });

      /* Tapping the haze flies to the nearest city's hotspots. */
      map.on("click", function (e) {
        if (map.getZoom() >= 8 || map.queryRenderedFeatures(e.point, { layers: ["spots"] }).length) return;
        var best = null, bd = Infinity;
        CITIES.forEach(function (c) {
          var d = Math.pow(c[0] - e.lngLat.lng, 2) + Math.pow(c[1] - e.lngLat.lat, 2);
          if (d < bd) { bd = d; best = c; }
        });
        if (best && bd < 9) map.flyTo({ center: [best[0], best[1]], zoom: 9.6, duration: reduce ? 0 : 1400 });
      });

      var reset = document.createElement("button");
      reset.type = "button";
      reset.className = "hotmap-reset";
      reset.textContent = "Back to India";
      reset.hidden = true;
      reset.addEventListener("click", function () { map.flyTo({ center: [79.5, 22.5], zoom: start, duration: reduce ? 0 : 1200 }); });
      box.appendChild(reset);
      map.on("moveend", function () { reset.hidden = map.getZoom() < start + 1; });

      /* Keep the credit one tap away instead of covering a phone-sized map. */
      var attrib = holder.querySelector(".maplibregl-ctrl-attrib");
      if (attrib) attrib.classList.remove("maplibregl-compact-show");

      box.classList.add("is-live");
    });
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      loadLib().then(function () { mount(en.target); }).catch(function () { /* keep the static fallback */ });
    });
  }, { rootMargin: "400px 0px" });

  boxes.forEach(function (b) { io.observe(b); });
})();
