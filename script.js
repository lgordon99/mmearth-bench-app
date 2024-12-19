let map = L.map('map').setView([0, 0], 2);
// L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
let Stadia_OSMBright = L.tileLayer('https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.{ext}?api_key=a43934c7-f6fc-4a3d-9165-e19550683b0d', {
	minZoom: 0,
	maxZoom: 20,
	attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	ext: 'png'
});

// const tasks = ['biomass', 'species', 'soil_nitrogen', 'soil_organic_carbon', 'soil_pH'];
const tasks = {
	// 'species': {'title': 'Species', 'color': 'red'},
               'soil_nitrogen': {'title': 'Soil nitrogen', 'color': 'blue'}};
let layers = Object.fromEntries(Object.keys(tasks).map(task => [task, {'tileLayer': L.layerGroup(),
        												  				'toolTipLayer': L.layerGroup(),
        												  				'sentinel2Layer': L.layerGroup()}]));
let soilNitrogenLayer = L.layerGroup();
let soilNitrogenToolTipLayer = L.layerGroup();
let sentinel2Layer = L.layerGroup();

Stadia_OSMBright.addTo(map);

// L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
//     attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
//     subdomains: 'abcd',
//     maxZoom: 19
// }).addTo(map);
// L.tileLayer('https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png', {
//     attribution: '&copy; <a href="https://wikimediafoundation.org/wiki/Maps_Terms_of_Use">Wikimedia</a> contributors',
//     maxZoom: 18
// }).addTo(map);

function showTilesWithoutModality() {
	for (const task of Object.keys(tasks)) {
		fetch(`${task}/${task}_tile_gdf.geojson`)
		.then(response => response.json())
		.then(data => {
			L.geoJson(data, {
				style: function(feature) {
					return {
						fillColor: tasks[task]['color'],
						color: tasks[task]['color'],
						weight: 1,
						fillOpacity: 0.7
					};
				}
			}).addTo(layers[task]['tileLayer']);
	
			L.geoJson(data, {
				style: function(feature) {
					return {
						fillOpacity: 0,
						weight: 3,
						color: tasks[task]['color'],
						interactive: false,  // Border shouldn't capture interactions
						pane: 'borderPane'  // Lower pane for borders
					};
				}
			}).addTo(layers[task]['toolTipLayer']);
	
			L.geoJson(data, {
				style: function(feature) {
					return {
						fillOpacity: 0,
						weight: 0,
						interactive: true,
						pane: 'tooltipPane' // uses a custom pane that's always on top
					};
				},
				onEachFeature: function (feature, layer) {
					layer.bindTooltip(`${tasks[task]['title']}: ${feature.properties[task]}`);
				}
			}).addTo(layers[task]['toolTipLayer']);
		
			layers[task]['tileLayer'].addTo(map);
			layers[task]['toolTipLayer'].addTo(map);
		});
	}
}

function loadSentinel2() {
	for (const task of Object.keys(tasks)) {
		fetch(`${task}/${task}_Sentinel-2_tile_bounds.json`)
		.then(response => response.json())
		.then(data => {
			for (const key in data) {
				const tileLayer = L.imageOverlay(`${task}/${task}_tiles/Sentinel-2/${key}Sentinel-2.png`, data[key], {
					opacity: 0.7
				});
				layers[task]['sentinel2Layer'].addLayer(tileLayer);
			}
			layers[task]['sentinel2Layer'].addTo(map);
			map.removeLayer(layers[task]['sentinel2Layer']);
		});
	}
}

map.createPane('borderPane');
map.getPane('borderPane').style.zIndex = 400;  // Lower z-index for borders

map.createPane('tooltipPane');
map.getPane('tooltipPane').style.zIndex = 650;  // Higher z-index for tooltips
map.getPane('tooltipPane').style.pointerEvents = 'all';

showTilesWithoutModality();
loadSentinel2()
// var tileLayer = L.tileLayer('http://localhost:8000/soil_nitrogen/rgb/{z}/{x}/{y}.png', {
// 		maxZoom: 10,    // Maximum zoom level from gdal2tiles
// 		attribution: '&copy; Your Tile Attribution'
// 	});

// 	tileLayer.addTo(map);

document.getElementById("world-map").addEventListener("click", function() {
	Stadia_OSMBright.addTo(map);
});

document.getElementById("clear").addEventListener("click", function() {
	Stadia_OSMBright.remove();
});

for (const task of Object.keys(tasks)) {
	document.getElementById(`${task}-checkbox`).addEventListener("change", function(e) {
		if (e.target.checked) { // if task checkbox checked
			map.addLayer(layers[task]['toolTipLayer']);

			if (document.getElementById("none").checked) {
				map.addLayer(layers[task]['tileLayer']);
			}

			if (document.getElementById("sentinel-2").checked) {
				map.addLayer(layers[task]['sentinel2Layer']);
			}
		} else { // if task checkbox unchecked
			map.removeLayer(layers[task]['toolTipLayer']);

			if (map.hasLayer(layers[task]['tileLayer'])) {
				map.removeLayer(layers[task]['tileLayer']);
			}	

			if (map.hasLayer(layers[task]['sentinel2Layer'])) {
				map.removeLayer(layers[task]['sentinel2Layer']);
			}	
		}
	});
}

document.getElementById("none").addEventListener("click", function() {
	for (const task of Object.keys(tasks)) {
		if (document.getElementById(`${task}-checkbox`).checked) {
			map.addLayer(layers[task]['tileLayer']);
		};

		if (map.hasLayer(layers[task]['sentinel2Layer'])) {
			map.removeLayer(layers[task]['sentinel2Layer']);
		}
	}
});

document.getElementById("sentinel-2").addEventListener("click", function() {
	for (const task of Object.keys(tasks)) {
		map.removeLayer(layers[task]['tileLayer']);
		map.addLayer(layers[task]['sentinel2Layer']);	
	}
});
