let map = L.map('map').setView([0, 0], 2); // sets center and initial zoom
let Stadia_OSMBright = L.tileLayer('https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.{ext}?api_key=a43934c7-f6fc-4a3d-9165-e19550683b0d', {
	minZoom: 0,
	maxZoom: 20,
	attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	ext: 'png'
});
const tasks = {
			//    'biomass': {'title': 'Biomass', 'color': 'green'},
			   'species': {'title': 'Species', 'color': 'red'},
               'soil_nitrogen': {'title': 'Soil nitrogen', 'color': 'blue'},
			   'soil_organic_carbon': {'title': 'Soil organic carbon', 'color': 'brown'},
			   'soil_pH': {'title': 'Soil pH', 'color': 'purple'}
			};
let layers = Object.fromEntries(Object.keys(tasks).map(task => [task, {'solidTileLayer': L.layerGroup(),
        												  			   'baseTileLayer': L.layerGroup(),
        												  			   'Sentinel-2': {},
																	   'Sentinel-1': {},
																	   'AsterDEM-elevation': {},
																	   'ETHGCH-canopy-height': {},
																	   'DynamicWorld': {},
																	   'ESA-Worldcover': {}}]));
const pixelLevelModalities = ['Sentinel-2','Sentinel-1', 'AsterDEM-elevation', 'ETHGCH-canopy-height', 'DynamicWorld', 'ESA-Worldcover']
const hoverPanel = document.getElementById('hover-panel');
const taskValue = document.getElementById('task-value')
const imageLevelModalities = document.getElementById('image-level-modalities-data');
const imageLevelModalityCheckbox = document.getElementById('image-level-modalities-checkbox');
let hoveredTileBounds = null;
let selectedModality = null;

function round(number, numDecimals) {
    const factor = Math.pow(10, numDecimals);
    return Math.round(number * factor) / factor;
}

function showHoverPanel(e, taskData, imageLevelModalityData) {
	const tile = e.target;
    const bounds = tile.getBounds();
    const topLeft = bounds.getNorthWest();
    const point = map.latLngToContainerPoint(topLeft); // converts the geographical coordinates to pixel coordinates

    hoverPanel.style.display = 'block';
    hoverPanel.style.left = `${point.x}px`;
    hoverPanel.style.top = `${point.y}px`;
	taskValue.innerText = taskData;
	imageLevelModalities.innerText = imageLevelModalityData;
}

function hideHoverPanel() {
    hoverPanel.style.display = 'none';
}

function showTilesWithoutModality() {
	for (const task of Object.keys(tasks)) {
		fetch(`${task}/${task}_tile_gdf.geojson`)
		.then(response => response.json())
		.then(data => {
			// solid tile
			L.geoJson(data, {
				style: function(feature) {
					return {
						fillColor: tasks[task]['color'],
						color: tasks[task]['color'],
						weight: 1,
						fillOpacity: 0.7
					};
				}
			}).addTo(layers[task]['solidTileLayer']);
			
			// tile border
			L.geoJson(data, {
				style: function(feature) {
					return {
						fillOpacity: 0,
						weight: 3,
						color: tasks[task]['color'],
						interactive: false,  // border shouldn't capture interactions
						pane: 'borderPane' // lower pane for borders
					};
				}
			}).addTo(layers[task]['baseTileLayer']);
			
			// show task value upon hover
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
					layer.on({mouseover: function (e) {
						hoveredTileBounds = layer.getBounds();
						let taskData = `${tasks[task]['title']}:`

						if (task == 'species' && feature.properties[task].includes(',')) {
							taskData += `\n${feature.properties[task].replace(/,/g, '\n')}`;
						} else {
							taskData += ` ${feature.properties[task]}`
						}
						// let taskData = `${tasks[task]['title']}: ${feature.properties[task]}`;
					
						if (task == 'soil_nitrogen' || task == 'soil_organic_carbon') {
							taskData += ' g/kg';
						}

						const imageLevelModalityData = `Latitude: ${feature.properties['latitude']}
						Longitude: ${feature.properties['longitude']}
						Month: ${feature.properties['month']}
						Biome: ${feature.properties['biome']}
						Ecoregion: ${feature.properties['ecoregion']}\n
						Climate
						${Object.entries(feature.properties['climate'])
							.map(([key, value]) => `${key}: ${round(value, 2)} ${key.includes('Temperature') ? 'K' : 'm'}`)
							.join('\n')}`
							.trim();
						showHoverPanel(e, taskData, imageLevelModalityData);
					}
				});
			}}).addTo(layers[task]['baseTileLayer']);
		
			layers[task]['solidTileLayer'].addTo(map);
			layers[task]['baseTileLayer'].addTo(map);
		});
	}
}

function loadPixelLevelModalities() {
	for (const task of Object.keys(tasks)) {
		fetch(`${task}/${task}_tile_bounds.json`) // fetches the tile bounds JSON for the given task
		.then(response => response.json())
		.then(data => {
			for (const key in data) {
				const bounds = L.latLngBounds([[data[key][0][0], data[key][0][1]], // southwest corner
											   [data[key][1][0], data[key][1][1]]]); // northeast corner
				
				for (const modality of pixelLevelModalities) {
					const tileLayer = L.imageOverlay(`${task}/tiles/${modality}/${key}${modality}.png`,
													 data[key],
													 {opacity: 0.9});
					layers[task][modality][key] = {layer: tileLayer, bounds: bounds};
				}
			}
		});
	}
}

function showVisibleTiles(task, modality) {
	const visibleBounds = map.getBounds(); // gets the current map bounds

	for (const key in layers[task][modality]) { // loops through all the tiles
		const tile = layers[task][modality][key]; // gets the tile in the selected modality

		if (visibleBounds.intersects(tile.bounds)) { // if the tile is visible on the map
			if (!map.hasLayer(tile.layer)) { // if the tile's modality is not already on the map
				map.addLayer(tile.layer); // add the tile's modality to the map
			}

			for (const otherModality of pixelLevelModalities) { // loops through all the modalities
				if (otherModality != modality) { // if the modality is not the selected one
					const otherTile = layers[task][otherModality][key]; // gets the tile in a specific modality

					if (map.hasLayer(otherTile.layer)) { // if the tile has another modality visible
						map.removeLayer(otherTile.layer); // removes the tile's other modality from the map
					}	
				}
			}
		} else { // if the tile is not visible on the map
			for (const otherModality of pixelLevelModalities) { // loops through all the modalities
					const otherTile = layers[task][otherModality][key]; // gets the tile in a specific modality

				if (map.hasLayer(otherTile.layer)) { // if the tile has that modality visible
					map.removeLayer(otherTile.layer); // removes the tile's modality from the map
				}
			}
		}
	}
}

function hidePixelLevelModalities(task) {
	for (const modality of pixelLevelModalities) { // loops through all the modalities
		for (const key in layers[task][modality]) { // loops through all the tiles
			const tile = layers[task][modality][key]; // gets the tile in the selected modality
			
			if (map.hasLayer(tile.layer)) { // if the tile has the modality visible
				map.removeLayer(tile.layer); // removes the tile's modality from the map
			}	
		}
	}
}

Stadia_OSMBright.addTo(map);

map.createPane('borderPane');
map.getPane('borderPane').style.zIndex = 400; // lower z-index for borders

map.createPane('tooltipPane');
map.getPane('tooltipPane').style.zIndex = 650; // higher z-index for tooltips
map.getPane('tooltipPane').style.pointerEvents = 'all';

showTilesWithoutModality();
loadPixelLevelModalities();

map.on('mousemove', function(e) { // whenever the mouse moves
    if (hoveredTileBounds) { // if a tile has been hovered over
        if (!hoveredTileBounds.contains(e.latlng)) { // if the mouse is no longer in the tile last hovered over
            hideHoverPanel();
            hoveredTileBounds = null;
        }
    }
});

map.on('zoomend', function(e) { // after zooming
	if (hoveredTileBounds) { // if a tile has been hovered over
		const topLeft = hoveredTileBounds.getNorthWest();
		const point = map.latLngToContainerPoint(topLeft);

		// move the hover panel to the right position
		hoverPanel.style.left = `${point.x}px`;
		hoverPanel.style.top = `${point.y}px`;
	}

	if (selectedModality) {
		for (const task of Object.keys(tasks)) {
			if (document.getElementById(`${task}-checkbox`).checked) { // if the task is selected
				showVisibleTiles(task, selectedModality); // shows only the tiles visible on the screen
			}
		}
	}
});

map.on('moveend', function() {
	if (selectedModality) {
		for (const task of Object.keys(tasks)) {
			if (document.getElementById(`${task}-checkbox`).checked) { // if the task is selected
				showVisibleTiles(task, selectedModality); // shows only the tiles visible on the screen
			}
		}
	}
});

// add event listener for the image level modality checkbox
imageLevelModalityCheckbox.addEventListener('change', function () {
    if (imageLevelModalityCheckbox.checked) {
        imageLevelModalities.style.display = 'block';
    } else {
        imageLevelModalities.style.display = 'none';
    }
});

document.getElementById("world-map").addEventListener("click", function() {
	Stadia_OSMBright.addTo(map);
});

document.getElementById("clear").addEventListener("click", function() {
	Stadia_OSMBright.remove();
});

// task buttons clicked
for (const task of Object.keys(tasks)) {
	document.getElementById(`${task}-checkbox`).addEventListener("change", function(e) {
		if (e.target.checked) { // if task checkbox checked
			map.addLayer(layers[task]['baseTileLayer']);

			if (document.getElementById("none").checked) {
				map.addLayer(layers[task]['solidTileLayer']);
			}

			for (const modality of pixelLevelModalities) {
				if (document.getElementById(modality).checked) {
					showVisibleTiles(task, modality);
				}
			}
		} else { // if task checkbox unchecked
			map.removeLayer(layers[task]['baseTileLayer']);

			if (map.hasLayer(layers[task]['solidTileLayer'])) {
				map.removeLayer(layers[task]['solidTileLayer']);
			}	

			hidePixelLevelModalities(task);
		}
	});
}

// None button clicked
document.getElementById("none").addEventListener("click", function() {
	selectedModality = null;

	for (const task of Object.keys(tasks)) {
		if (document.getElementById(`${task}-checkbox`).checked) {
			hidePixelLevelModalities(task);
			map.addLayer(layers[task]['solidTileLayer']);
		};
	}
});

// modality buttons clicked
for (const modality of pixelLevelModalities) {
	document.getElementById(modality).addEventListener("click", function() {
		selectedModality = modality;

		for (const task of Object.keys(tasks)) {
			if (document.getElementById(`${task}-checkbox`).checked) { // if the task is selected
				map.removeLayer(layers[task]['solidTileLayer']);
				showVisibleTiles(task, modality);
			}
		}
	});
}
