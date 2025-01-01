let map = L.map('map').setView([0, 0], 2); // sets center and initial zoom
let Stadia_OSMBright = L.tileLayer('https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.{ext}', {
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
const layers = Object.fromEntries(Object.keys(tasks).map(task => [task, {}]));
const pixelLevelModalities = ['Sentinel-2','Sentinel-1', 'AsterDEM-elevation', 'ETHGCH-canopy-height', 'DynamicWorld', 'ESA-Worldcover']
const hoverPanel = document.getElementById('hover-panel');
const taskValue = document.getElementById('task-value')
const imageLevelModalities = document.getElementById('image-level-modalities-data');
const imageLevelModalityCheckbox = document.getElementById('image-level-modalities-checkbox');
let hoveredTileBounds = null;
let selectedBackground = document.querySelector('input[name="pixel-level-modalities"]:checked').id;
let checkedTasks = Array.from(document.querySelectorAll('input[name="task"]:checked')).map(checkbox => checkbox.id);

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

async function loadTaskLayers(task) {
	const response = await fetch(`https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/${task}_tile_gdf.geojson`);
	const data = await response.json();

	data.features.forEach(tile => {
		const id = tile.properties.id;
		const color = tasks[task]['color'];

		layers[task][id] = {};
		layers[task][id]['bounds'] = L.geoJson(tile).getBounds();
		layers[task][id]['baseLayers'] = {}
		layers[task][id]['backgrounds'] = {}
		layers[task][id]['baseLayers']['border'] = L.geoJson(tile, {
			style: function() {
				return {
					fillOpacity: 0,
					weight: 3,
					color: color,
					interactive: false,
					pane: 'borderPane'
				};
			}
		});
		layers[task][id]['baseLayers']['hoverPanel'] = L.geoJson(tile, {
			style: function() {
				return {
					fillOpacity: 0,
					weight: 0,
					interactive: true,
					pane: 'hoverPanelPane'
				};
			},
			onEachFeature: function(_, layer) {
				layer.on({
					mouseover: function(e) {
						hoveredTileBounds = layers[task][id]['bounds'];

						let taskData = `${tasks[task]['title']}:`;

						if (task == 'species' && tile.properties[task].includes(',')) {
							taskData += `\n${tile.properties[task].replace(/,/g, '\n')}`;
						} else {
							taskData += ` ${tile.properties[task]}`;
						}

						if (task === 'soil_nitrogen' || task === 'soil_organic_carbon') {
							taskData += ' g/kg';
						}

						const imageLevelModalityData = `Latitude: ${tile.properties['latitude']}
						Longitude: ${tile.properties['longitude']}
						Month: ${tile.properties['month']}
						Biome: ${tile.properties['biome']}
						Ecoregion: ${tile.properties['ecoregion']}\n
						Climate
						${Object.entries(tile.properties['climate'])
							.map(([key, value]) => `${key}: ${round(value, 2)} ${key.includes('Temperature') ? 'K' : 'm'}`)
							.join('\n')}`
							.trim();

						showHoverPanel(e, taskData, imageLevelModalityData);
					}
				});
			}
		});
		layers[task][id]['backgrounds']['solid'] = L.geoJson(tile, {
			style: function() {
				return {
					fillColor: color,
					color: color,
					weight: 1,
					fillOpacity: 0.7
				};
			}
		});
		for (const modality of pixelLevelModalities) {
			layers[task][id]['backgrounds'][modality] = L.imageOverlay(`https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/tiles/${modality}/tile_${id}_${modality}.png`,
																		layers[task][id]['bounds'],
																		{opacity: 0.9});
		}
	});
}

function showVisibleTiles(task, selectedBackground) {
	const visibleBounds = map.getBounds(); // gets the current map bounds

	for (const id of Object.keys(layers[task])) {
		const tile = layers[task][id];

		if (visibleBounds.intersects(tile['bounds'])) {
			if (!map.hasLayer(tile['backgrounds'][selectedBackground])) {
				map.addLayer(tile['backgrounds'][selectedBackground]);
			}

			for (const baseLayer of Object.keys(tile['baseLayers'])) {
				if (!map.hasLayer(tile['baseLayers'][baseLayer])) {
					map.addLayer(tile['baseLayers'][baseLayer]);
				}
			}

			for (const otherBackground of Object.keys(tile['backgrounds'])) {
				if (otherBackground != selectedBackground) {
					const otherBackgroundLayer = layers[task][id]['backgrounds'][otherBackground];

					if (map.hasLayer(otherBackgroundLayer)) {
						map.removeLayer(otherBackgroundLayer);
					}
				}
			}
		} else {
			for (const baseLayer of Object.keys(tile['baseLayers'])) {
				if (map.hasLayer(tile['baseLayers'][baseLayer])) {
					map.removeLayer(tile['baseLayers'][baseLayer]);
				}
			}

			for (const background of Object.keys(tile['backgrounds'])) {
				const backgroundLayer = layers[task][id]['backgrounds'][background];

				if (map.hasLayer(backgroundLayer)) {
					map.removeLayer(backgroundLayer);
				}
			}
		}
	}
}

async function loadAndDisplayTasks() {
	for (const task of checkedTasks) {
		await loadTaskLayers(task);
		showVisibleTiles(task, selectedBackground);
	}
}

function hideTask(task) {
	for (const id of Object.keys(layers[task])) {
		const tile = layers[task][id];

		for (const baseLayer of Object.keys(tile['baseLayers'])) {
			if (map.hasLayer(tile['baseLayers'][baseLayer])) {
				map.removeLayer(tile['baseLayers'][baseLayer]);
			}
		}

		for (const background of Object.keys(tile['backgrounds'])) {
			const backgroundLayer = layers[task][id]['backgrounds'][background];

			if (map.hasLayer(backgroundLayer)) {
				map.removeLayer(backgroundLayer);
			}
		}
	}
}

function hideHoverPanel() {
    hoverPanel.style.display = 'none';
}

Stadia_OSMBright.addTo(map);

map.createPane('borderPane');
map.getPane('borderPane').style.zIndex = 400; // lower z-index for borders

map.createPane('hoverPanelPane');
map.getPane('hoverPanelPane').style.zIndex = 650; // higher z-index for tooltips
map.getPane('hoverPanelPane').style.pointerEvents = 'all';

loadAndDisplayTasks();

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

	for (const task of checkedTasks) {
		showVisibleTiles(task, selectedBackground);
	}	
});

map.on('moveend', function() {
	for (const task of checkedTasks) {
		showVisibleTiles(task, selectedBackground);
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
	document.getElementById(task).addEventListener("change", function(e) {
		checkedTasks = Array.from(document.querySelectorAll('input[name="task"]:checked')).map(checkbox => checkbox.id);

		if (e.target.checked) { // if task checkbox checked
			showVisibleTiles(task, selectedBackground);
		} else { // if task checkbox unchecked
			hideTask(task);
		}
	});
}

// modality buttons clicked
document.querySelectorAll('input[name="pixel-level-modalities"]').forEach(radio => {
    radio.addEventListener('change', () => {
		selectedBackground = document.querySelector('input[name="pixel-level-modalities"]:checked').id;

		for (const task of checkedTasks) {
			showVisibleTiles(task, selectedBackground);
		}
    });
});
