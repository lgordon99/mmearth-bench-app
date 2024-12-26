let map = L.map('map').setView([0, 0], 2);
let Stadia_OSMBright = L.tileLayer('https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.{ext}?api_key=a43934c7-f6fc-4a3d-9165-e19550683b0d', {
	minZoom: 0,
	maxZoom: 20,
	attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	ext: 'png'
});

const tasks = {
			//    'species': {'title': 'Species', 'color': 'red'},
               'soil_nitrogen': {'title': 'Soil nitrogen', 'color': 'blue'},
			//    'soil_organic_carbon': {'title': 'Soil organic carbon', 'color': 'brown'},
			//    'soil_pH': {'title': 'Soil pH', 'color': 'purple'}
			};
let layers = Object.fromEntries(Object.keys(tasks).map(task => [task, {'tileLayer': L.layerGroup(),
        												  			   'toolTipLayer': L.layerGroup(),
        												  			   'Sentinel-2': {},
																	   'Sentinel-1': {},
																	   'AsterDEM-elevation': {},
																	   'ETHGCH-canopy-height': {},
																	   'DynamicWorld': {},
																	   'ESA-Worldcover': {}
																	}]));
const pixelLevelModalities = ['Sentinel-2','Sentinel-1', 'AsterDEM-elevation', 'ETHGCH-canopy-height', 'DynamicWorld', 'ESA-Worldcover']
const hoverPanel = document.getElementById('hover-panel');
const taskValue = document.getElementById('task-value')
const imageLevelModalities = document.getElementById('image-level-modalities-data');
const imageLevelModalityCheckbox = document.getElementById('image-level-modalities-checkbox');
let activeBounds = null;
let selectedModality = null;

// Add event listener for the checkbox to toggle modalities info
imageLevelModalityCheckbox.addEventListener('change', function () {
    if (imageLevelModalityCheckbox.checked) {
        imageLevelModalities.style.display = 'block';
    } else {
        imageLevelModalities.style.display = 'none';
    }
});

function round(num, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

function showHoverPanel(e, taskData, imageLevelModalityData) {
	const layer = e.target;
    const bounds = layer.getBounds();
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

map.on('mousemove', function(e) {
    if (activeBounds) {
        // check if mouse is within the bounds of the tile last hovered over
        if (!activeBounds.contains(e.latlng)) {
            hideHoverPanel();
            activeBounds = null;
        }
    }
});

map.on('zoomend', function(e) {
	if (activeBounds) {
		const topLeft = activeBounds.getNorthWest();
		const point = map.latLngToContainerPoint(topLeft);
		hoverPanel.style.left = `${point.x}px`;
		hoverPanel.style.top = `${point.y}px`;
	}

	showVisibleTiles(selectedModality);
})

map.on('moveend', () => showVisibleTiles(selectedModality));

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
			}).addTo(layers[task]['tileLayer']);
			
			// tile border
			L.geoJson(data, {
				style: function(feature) {
					return {
						fillOpacity: 0,
						weight: 3,
						color: tasks[task]['color'],
						interactive: false,  // border shouldn't capture interactions
						pane: 'borderPane'  // lower pane for borders
					};
				}
			}).addTo(layers[task]['toolTipLayer']);
	
			// task value upon hover
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
					// layer.bindTooltip(`${tasks[task]['title']}: ${feature.properties[task]}`);
					layer.on({
						mouseover: function (e) {
							activeBounds = layer.getBounds();
							let taskData = `${tasks[task]['title']}: ${feature.properties[task]}`;
						
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
				}
			}).addTo(layers[task]['toolTipLayer']);
		
			layers[task]['tileLayer'].addTo(map);
			layers[task]['toolTipLayer'].addTo(map);
		});
	}
}

// function loadPixelLevelModalities() {
// 	for (const task of Object.keys(tasks)) {
// 		fetch(`${task}/${task}_tile_bounds.json`)
// 		.then(response => response.json())
// 		.then(data => {
// 			for (const key in data) {
// 				for (const modality of pixelLevelModalities) {
// 					const modalityLayer = L.imageOverlay(`${task}/tiles/${modality}/${key}${modality}.png`,
// 														 data[key],
// 														 {opacity: 0.9});
// 					layers[task][modality].addLayer(modalityLayer);
// 				}
// 			}
// 		});
// 	}
// }

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
			}
		);
	}
}

function showVisibleTiles(modality) {
	const visibleBounds = map.getBounds(); // gets the current map bounds

	for (const task of Object.keys(tasks)) {
		if (document.getElementById(`${task}-checkbox`).checked) {
			for (const key in layers[task][modality]) {
				const tile = layers[task][modality][key];

				if (visibleBounds.intersects(tile.bounds)) {
					if (!map.hasLayer(tile.layer)) {
						map.addLayer(tile.layer);
					}
					for (const otherModality of pixelLevelModalities) {
						if (otherModality != modality) {
							const otherTile = layers[task][otherModality][key];

							if (map.hasLayer(otherTile.layer)) {
								map.removeLayer(otherTile.layer);
							}	
						}
					}
				} else {
					if (map.hasLayer(tile.layer)) {
						map.removeLayer(tile.layer);
					}
				}
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
			map.addLayer(layers[task]['toolTipLayer']);

			if (document.getElementById("none").checked) {
				map.addLayer(layers[task]['tileLayer']);
			}

			for (const modality of pixelLevelModalities) {
				if (document.getElementById(modality).checked) {
					map.addLayer(layers[task][modality]);
				}
			}
		} else { // if task checkbox unchecked
			map.removeLayer(layers[task]['toolTipLayer']);

			if (map.hasLayer(layers[task]['tileLayer'])) {
				map.removeLayer(layers[task]['tileLayer']);
			}	

			for (const modality of pixelLevelModalities) {
				if (map.hasLayer(layers[task][modality])) {
					map.removeLayer(layers[task][modality]);
				}
			}
		}
	});
}

// None button clicked
document.getElementById("none").addEventListener("click", function() {
	selectedModality = null;

	for (const task of Object.keys(tasks)) {
		if (document.getElementById(`${task}-checkbox`).checked) {
			map.addLayer(layers[task]['tileLayer']);
		};

		for (const modality of pixelLevelModalities) {
			if (map.hasLayer(layers[task][modality])) {
				map.removeLayer(layers[task][modality]);
			}
		}
	}
});

// modality buttons clicked
for (const modality of pixelLevelModalities) {
	document.getElementById(modality).addEventListener("click", function() {
		for (const task of Object.keys(tasks)) {
			map.removeLayer(layers[task]['tileLayer']);
			showVisibleTiles(modality);
			selectedModality = modality;
		}
	});
}
