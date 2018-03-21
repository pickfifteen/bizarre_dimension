const WIDTH = 8192;
const HEIGHT = 10240;
const MARGIN = 300;

const MIN_ZOOM = 0;
const MAX_ZOOM = 6;

let jsonData;
const options = window.location.search ? window.location.search.slice(1).split(',') : [];

const shortestDoors = L.layerGroup([]);
const otherDoors = L.layerGroup([]);
const clusters = L.layerGroup([]);
const chests = L.layerGroup([]);
const overlayMaps = {
  "Shortest Path Doors": shortestDoors,
  "Other Doors": otherDoors,
  "Clusters": clusters,
  "Chests": chests,
};
const map = L.map('map', {
    crs: L.CRS.Simple,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    layers: [shortestDoors]
});
L.control.layers(null, overlayMaps).addTo(map);
let rc = new L.RasterCoords(map, [WIDTH, HEIGHT]);
console.log(`RC zoomLevel: ${rc.zoomLevel()}`);

const xy = function(x, y) {
  if (L.Util.isArray(x)) {    // When doing xy([x, y]);
    return rc.unproject(x);
  }
  return rc.unproject([x, y]);  // When doing xy(x, y);
};

map.on('click', e => {
  console.log(`Click. latlng: ${e.latlng}, xy: ${rc.project(e.latlng)}`);
});

const mapImage = L.tileLayer('images/tiles/{z}/{x}/{y}.png', {
  noWrap: true,
  bounds: L.latLngBounds([xy(0, 0), xy(WIDTH, HEIGHT)])
}).addTo(map)
map.setView(xy(WIDTH / 2, HEIGHT / 2), 3);
map.setMaxBounds(L.latLngBounds([xy(-MARGIN, -MARGIN), xy(WIDTH+MARGIN, HEIGHT+MARGIN)]));

const dialog = document.querySelector('#fileloadOverlay');
dialogPolyfill.registerDialog(dialog);
dialog.showModal();
document.querySelector('#inputFile').addEventListener("change", handleFileUpload, false);
function handleFileUpload() {
  handleFiles(this.files);
}
function handleFiles(fileList) {
  if(!fileList || fileList.length != 1) {
    return;
  }
  dialog.close();
  const reader = new FileReader();
  reader.onload = e => {
    const data = JSON.parse(e.target.result);
    processJson(data);
  };
  reader.readAsText(fileList[0]);
}
document.querySelector('#inputUrlSubmit').addEventListener("click", handleUrl, false);
function handleUrl() {
  const field = document.querySelector('#inputUrl');
  if(field.value.length < 10) {
    return;
  }
  dialog.close();
  loadUrl(field.value);
}
document.querySelector('#inputSampleSubmit').addEventListener("click", handleSample, false);
function handleSample() {
  dialog.close();
  loadUrl("sample.spoiler.json");
}
const dropTarget = document.querySelector('#dropTarget');
dropTarget.addEventListener("dragenter", ignore, false);
dropTarget.addEventListener("dragover", ignore, false);
dropTarget.addEventListener("drop", drop, false);
function ignore(e) {
  e.stopPropagation();
  e.preventDefault();
}
function drop(e) {
  e.stopPropagation();
  e.preventDefault();
  console.log("hi");
  var dt = e.dataTransfer;
  var files = dt.files;
  handleFiles(files);
}

/********************** */

let doorLines = [];
function clearDoorLines() {
  doorLines.forEach(doorLine => doorLine.remove());
  doorLines = [];
}
function drawDoorLine(door, opts) {
  if(!door.xDestination) {
    return;
  }
  opts = opts || {weight: 4, color: 'yellow'};
  const doorLine = L.polyline([xy(door.x, door.y), xy(door.xDestination, door.yDestination)],
    opts).addTo(map);
  doorLines.push(doorLine);
}
function clickDoor(e) {
  clearDoorLines();
  drawDoorLine(this);
}
function clickCluster(e) {
  clearDoorLines();
  this.doors.forEach(door => drawDoorLine(door));
  if(!options.includes('doorcheck')) return;
  jsonData.clusters.forEach(cluster => {
    if(cluster == this) return;
    cluster.doors.forEach(door => {
      if(door.xDestination >= this.explicitBounds.x1 && door.xDestination <= this.explicitBounds.x2 && 
        door.yDestination >= this.explicitBounds.y1 && door.yDestination <= this.explicitBounds.y2 ) {
          drawDoorLine(door, {weight: 3, color: 'blue'});
        }
    })
  })
}

function loadUrl(url) {
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
  jsonData = json;
  shortestDoors.clearLayers();
  otherDoors.clearLayers();
  clusters.clearLayers();
  chests.clearLayers();
  json.chests && json.chests.forEach(chest => {
    const markerLoc = xy(chest.x, chest.y);
    let symbol = '🎁';
    desc = `Name: ${chest.name}`;
    if(chest.money !== undefined) {
      symbol = '💲';
      desc = `Money: $${chest.money}`;
    }
    if(chest.itemType == 0x10) symbol = '🗡️';
    if(chest.itemType == 0x14) symbol = '🛡️';
    if(chest.itemType == 0x18) symbol = '🧤';
    if(chest.itemType == 0x1C) symbol = '🎩';
    if([32, 36, 40, 44].indexOf(chest.itemType) != -1) symbol = '🥤';
    const opts = {icon: L.icon.glyph({ glyph: symbol, iconUrl: 'images/marker-blue.svg' })};
    const marker = L.marker(markerLoc, opts).addTo(chests).bindPopup(desc);
  });
  const doorOpts = {icon: L.icon.glyph({ glyph: '🚪', iconUrl: 'images/marker-gray.svg' })};

  json.clusters && json.clusters.forEach(cluster => {
    cluster.area = (cluster.explicitBounds.x2 - cluster.explicitBounds.x1) * 
      (cluster.explicitBounds.y2 - cluster.explicitBounds.y1);
  });
  const sortedClusters = (json.clusters  || []).sort((a, b) => b.area - a.area);
  sortedClusters.forEach(cluster => {
    if(cluster.doors.every(door => !door.xDestination)) {
      // Completely ignore clusters with no reachable doors.
      return;
    }
    const rank = Math.ceil(cluster.rank);
    const bounds = [xy(cluster.explicitBounds.x1, cluster.explicitBounds.y1),
      xy(cluster.explicitBounds.x2, cluster.explicitBounds.y2)];
    const rect = L.rectangle(bounds).addTo(clusters).on('click', clickCluster.bind(cluster));
    rect.bindPopup(`Rank: ${rank}`);
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
        marker = L.marker(markerLoc, doorOpts).addTo(otherDoors);
      }
      marker.on('click', clickDoor.bind(door));
    })
  })
}

