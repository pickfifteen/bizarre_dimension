const shortestDoors = L.layerGroup([]);
const otherDoors = L.layerGroup([]);
const overlayMaps = {
  "Shortest Path Doors": shortestDoors,
  "Other Doors": otherDoors,
};
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 1,
    layers: [shortestDoors]
});
L.control.layers(null, overlayMaps).addTo(map);

const WIDTH = 8192;
const HEIGHT = 10240;
const MARGIN = 300;

const yx = L.latLng;
const xy = function(x, y) {
  if (L.Util.isArray(x)) {    // When doing xy([x, y]);
    return yx(HEIGHT - x[1], x[0]);
  }
  return yx(HEIGHT - y, x);  // When doing xy(x, y);
};

const mapImage = L.imageOverlay('images/fullmap.png', [xy(0, 0), xy(WIDTH, HEIGHT)]).addTo(map);
map.setView(xy(WIDTH / 2, HEIGHT / 2), -3);
map.setMaxBounds(L.latLngBounds([xy(-MARGIN, -MARGIN), xy(WIDTH+MARGIN, HEIGHT+MARGIN)]));

loadUrl("sample.spoiler.json");

/********************** */

let doorLine;
function drawDoorLine(e) {
  if(!doorLine) {
    doorLine = L.polyline([], {weight: 4, color: 'yellow'}).addTo(map);
  }
  doorLine.setLatLngs([xy(this.x, this.y), xy(this.xDestination, this.yDestination)]);
}

function loadUrl(url) {
  shortestDoors.clearLayers();
  otherDoors.clearLayers();
  const request = new XMLHttpRequest();
  request.open('GET', url, true);

  request.onload = function() {
    if (request.status >= 200 && request.status < 400) {
      const data = JSON.parse(request.responseText);
      processJson(data);
    } else {
      console.log("Server error");
      console.log(request);
    }
  };

  request.onerror = function() {
    console.log("Connection error");
  };

  request.send();
}

function processJson(json) {
  const defaultOpts = {icon: L.icon.glyph({ glyph: '🚪', iconUrl: 'images/marker-gray.svg' })};
  json.clusters.forEach(cluster => {
    const rank = Math.ceil(cluster.rank);
    cluster.doors.forEach(door => {
      if(!door.xDestination) {
        // A door that was turned into a non-exit in the AC. We don't need to display this.
        return;
      }
      const markerLoc = xy(door.x, door.y);
      let marker;
      if(door.onShortestPath) {
        const opts = {icon: L.icon.glyph({ glyph: rank, iconUrl: 'images/marker-red.svg' })};
        marker = L.marker(markerLoc, opts).addTo(shortestDoors);
      }
      else {
        marker = L.marker(markerLoc, defaultOpts).addTo(otherDoors);
      }
      marker.on('click', drawDoorLine.bind(door));
    })
  })
}

