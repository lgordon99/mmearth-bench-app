let map = L.map('map', {
	fadeAnimation: false, // makes tiles appear instantly, not with a fade-in
	zoomAnimation: true, // keeps zoom animation
	markerZoomAnimation: false // prevents markers from zooming in and out with the map
}).setView([0, 0], 2); // sets center and initial zoom

// Backgrounds
let Stadia_OSMBright = L.tileLayer('https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.{ext}', {
	minZoom: 0,
	maxZoom: 20,
	attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	ext: 'png',
});
let Esri_WorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
	minZoom: 0,
	maxZoom: 19,
	attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

const tasks = {
	'biomass': {'title': 'Biomass', 'color': 'green'},
               'soil_nitrogen': {'title': 'Soil nitrogen', 'color': 'blue'},
			   'soil_organic_carbon': {'title': 'Soil organic carbon', 'color': 'brown'},
			   'soil_pH': {'title': 'Soil pH', 'color': 'purple'},
               'species': {'title': 'Species', 'color': 'red'}
			};
const layers = Object.fromEntries(Object.keys(tasks).map(task => [task, {}]));
const viewportHeight = window.innerHeight;
const zoomInstruction = document.getElementById('zoom-instruction');
const zoomLevelValue = document.getElementById('zoom-level-value');
const pixelLevelModalitiesContainer = document.getElementById('pixel-level-modalities-container');
// const pixelLevelModalities = ['Sentinel-2','Sentinel-1', 'AsterDEM-elevation', 'ETHGCH-canopy-height', 'DynamicWorld', 'ESA-Worldcover']
// const pixelLevelModalities =['Sentinel2', 'Sentinel-1', 'AsterDEM-elevation', 'ETHGCH-canopy-height', 'DynamicWorld', 'ESA-Worldcover', 'MSK_CLDPRB', 'S2CLOUDLESS']
const pixelLevelModalities =['Sentinel2', 'Sentinel1', 'ETH_GCH', 'DynamicWorld', 'ESA_WorldCover', 'MSK_CLDPRB', 'S2CLOUDLESS', 'SCL']
const hoverPanel = document.getElementById('hover-panel');
const taskValue = document.getElementById('task-value');
const tileLevelModalities = document.getElementById('tile-level-modalities-data');
const tileLevelModalityCheckbox = document.getElementById('tile-level-modalities-checkbox');
const biomassValuesContainer = document.getElementById('biomass-values-container');
const biomassValuesCheckbox = document.getElementById('biomass-values-checkbox');
const biomassLegend = document.getElementById('biomass-legend');
const dynamicWorldLegend = document.getElementById('dynamicworld-legend');
const esaWorldCoverLegend = document.getElementById('esa-worldcover-legend');
const mskCldprbLegend = document.getElementById('msk-cldprb-legend');
const s2cloudlessLegend = document.getElementById('s2cloudless-legend');
const sclLegend = document.getElementById('scl-legend');
const ethGchLegend = document.getElementById('eth-gch-legend');
let hoveredTileBounds = null;
let selectedBackground = document.querySelector('input[name="pixel-level-modalities"]:checked').id;
let checkedTasks = Array.from(document.querySelectorAll('input[name="task"]:checked')).map(checkbox => checkbox.id);

function round(number, numDecimals) {
    const factor = Math.pow(10, numDecimals);
    return Math.round(number * factor) / factor;
}

function getTaskData(task, properties) {
	let taskData = `${tasks[task]['title']}:`;

	if (task !== 'biomass') {
		if (task === 'species' && properties[task]) {
			// If it's an array, join with newlines; if string with commas, replace commas
			if (Array.isArray(properties[task])) {
				taskData += `\n${properties[task].join('\n')}`;
			} else if (typeof properties[task] === 'string') {
				taskData += `\n${properties[task].replace(/,\s*/g, '\n')}`;
			}
		} else if (properties[task]) {
			taskData += ` ${properties[task]}`;
		}

		if (task === 'soil_nitrogen' || task === 'soil_organic_carbon') {
			taskData += ' g/kg';
		}
	}

	return taskData;
}

function getTileLevelData(properties) {
	return `ID: ${properties.ID}
			Sentinel-2 date: ${properties['sentinel2_date']}
			Latitude: ${properties['latitude']}
			Longitude: ${properties['longitude']}
			Biome: ${properties['biome']}
			Ecoregion: ${properties['ecoregion']}
			Precipitation previous month: ${properties['Precipitation previous month']} m
			Precipitation this month: ${properties['Precipitation this month']} m
			Precipitation year: ${properties['Precipitation year']} m
			Temperature previous month max: ${properties['Temperature previous month max']} K
			Temperature previous month mean: ${properties['Temperature previous month mean']} K
			Temperature previous month min: ${properties['Temperature previous month min']} K
			Temperature this month max: ${properties['Temperature this month max']} K
			Temperature this month mean: ${properties['Temperature this month mean']} K
			Temperature this month min: ${properties['Temperature this month min']} K
			Temperature year max: ${properties['Temperature year max']} K
			Temperature year mean: ${properties['Temperature year mean']} K
			Temperature year min: ${properties['Temperature year min']} K
			MSK_CLDPRB cloudy pixel percentage: ${properties['MSK_CLDPRB_CLOUDY_PIXEL_PERCENTAGE']}%
			S2CLOUDLESS cloudy pixel percentage: ${properties['S2CLOUDLESS_CLOUDY_PIXEL_PERCENTAGE']}%
			SCL no data pixel percentage: ${properties['SCL_NO_DATA_PIXEL_PERCENTAGE']}%`;
}

function updateBiomassOverlays() {
	// Only update if biomass checkbox is checked and biomass is loaded
	if (!biomassValuesCheckbox.checked || !layers['biomass'] || !layers['biomass']['tilesWithBounds']) {
		return;
	}
	
	const visibleBounds = map.getBounds();
	const tilesWithBounds = layers['biomass']['tilesWithBounds'];
	
	// Filter visible features
	let visibleTiles = tilesWithBounds
		.filter(item => visibleBounds.intersects(item.bounds))
		.map(item => item.feature);
	
	// Remove old biomass image overlays
	if (layers['biomass']['biomassImageOverlays']) {
		layers['biomass']['biomassImageOverlays'].forEach(overlay => {
			map.removeLayer(overlay);
		});
	}
	
	// Create new biomass image overlays
	layers['biomass']['biomassImageOverlays'] = [];
	
	visibleTiles.forEach(tile => {
		const imageURL = `https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/biomass/png_tiles/biomass/tile_${tile.properties.ID}_biomass.png`;
		const bounds = L.geoJson(tile).getBounds();
		const imageOverlay = L.imageOverlay(imageURL, bounds, {opacity: 0.9, interactive: false, crossOrigin: true});
		imageOverlay.addTo(map);
		layers['biomass']['biomassImageOverlays'].push(imageOverlay);
	});
}

function preventHoverPanelSpill() {
	const panelRect = hoverPanel.getBoundingClientRect(); // gets panel dimensions
	const availableSpaceBelow = viewportHeight - panelRect.top - 40;

	if (panelRect.height > availableSpaceBelow) { // if the panel spills off the bottom of the screen
        hoverPanel.style.maxHeight = `${availableSpaceBelow}px`;
    } else {
        hoverPanel.style.maxHeight = 'none'; // resets height if there's enough space
    }
}

function showHoverPanel(e, taskData, tileLevelData) {
	const tile = e.target;
    const bounds = tile.getBounds();
    const topLeft = bounds.getNorthWest();
    const point = map.latLngToContainerPoint(topLeft); // converts the geographical coordinates to pixel coordinates

    hoverPanel.style.display = 'block';
    hoverPanel.style.left = `${point.x}px`;
	hoverPanel.style.top = point.y > 0 ? `${point.y}px` : '0px'; // prevents the hover panel from spilling off the top
	taskValue.innerHTML = (taskData || '').replace(/\n/g, '<br>');
	tileLevelModalities.innerText = tileLevelData || '';

	if (taskData == 'Biomass:') {
		biomassValuesContainer.style.display = 'flex';
	}

	preventHoverPanelSpill();
}

async function loadTaskLayers(task) {
	const response = await fetch(`https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/${task}_map_gdf.geojson`);
	const data = await response.json();
	const color = tasks[task]['color'];

	// Pre-calculate bounds for all tiles to avoid recalculating during panning
	const tilesWithBounds = data.features.map(tile => {
		const geoJson = L.geoJson(tile);
		return {
			feature: tile,
			bounds: geoJson.getBounds()
		};
	});

	// Store the pre-calculated data
	layers[task]['allData'] = data;
	layers[task]['tilesWithBounds'] = tilesWithBounds; // Store pre-calculated bounds
	layers[task]['color'] = color;
	layers[task]['currentLayer'] = null;
	layers[task]['currentImageOverlays'] = null;
	layers[task]['visibleTileIds'] = new Set(); // Track which tiles are currently visible
	layers[task]['tileLayers'] = {}; // Store individual tile layers by ID
	layers[task]['tileImageOverlays'] = {}; // Store individual image overlays by ID
	
	// Only initialize biomassImageOverlays for the biomass task
	if (task === 'biomass') {
		layers[task]['biomassImageOverlays'] = null; // For biomass value overlays
	}
}

function showVisibleTiles(task, selectedBackground, forceUpdate=false) {
    const visibleBounds = map.getBounds();
    const tilesWithBounds = layers[task]['tilesWithBounds'];
    const color = layers[task]['color'];
    const zoom = map.getZoom();

    if (!tilesWithBounds) return; // if the data isn't ready yet, return

    // Get currently visible tile IDs
    const visibleTiles = tilesWithBounds.filter(item => visibleBounds.intersects(item.bounds));
    const newVisibleTileIds = new Set(visibleTiles.map(item => item.feature.properties.ID));
    const oldVisibleTileIds = layers[task]['visibleTileIds'];
    
    // Determine which tiles to add and which to remove
    const tilesToAdd = [...newVisibleTileIds].filter(id => !oldVisibleTileIds.has(id));
    const tilesToRemove = [...oldVisibleTileIds].filter(id => !newVisibleTileIds.has(id));
    
    // If nothing changed and not forcing update, return early
    if (!forceUpdate && tilesToAdd.length === 0 && tilesToRemove.length === 0) {
        return;
    }
    
    const lineWeight = zoom >= 6 ? 2.5 : 1.5;
    const fillOpacity = selectedBackground === 'solid' ? 0.7 : 0;
    
    // Remove tiles that are no longer visible
    tilesToRemove.forEach(tileID => {
        // Remove tile layer
        if (layers[task]['tileLayers'][tileID]) {
            map.removeLayer(layers[task]['tileLayers'][tileID]);
            delete layers[task]['tileLayers'][tileID];
        }
        
        // Remove image overlay if it exists
        if (layers[task]['tileImageOverlays'][tileID]) {
            map.removeLayer(layers[task]['tileImageOverlays'][tileID]);
            delete layers[task]['tileImageOverlays'][tileID];
        }
    });
    
    // Add new tiles that became visible
    tilesToAdd.forEach(tileID => {
        const tileData = visibleTiles.find(item => item.feature.properties.ID === tileID);
        if (!tileData) return;
        
        const feature = tileData.feature;
        const bounds = tileData.bounds;
        
        // Create and add tile layer
        const tileLayer = L.geoJson(feature, {
            style: {
                fillColor: selectedBackground === 'solid' ? color : 'transparent',
                color: color,
                weight: lineWeight,
                fillOpacity: fillOpacity,
                interactive: true
            },
            onEachFeature: function(feature, layer) {
                layer.on({
                    mouseover: function(e) {
                        if (map.getZoom() < 10) return;
                        
                        cancelPendingHide();
                        
                        const tile = e.target;
                        const bounds = tile.getBounds();
                        hoveredTileBounds = bounds;
                        isHovering = true;
                        const taskData = getTaskData(task, feature.properties);
                        const tileLevelData = getTileLevelData(feature.properties);
                        showHoverPanel(e, taskData, tileLevelData);
                    }
                });
            }
        });
        
        tileLayer.addTo(map);
        layers[task]['tileLayers'][tileID] = tileLayer;
        
        // Add pixel-level modality image overlay if needed
        if (selectedBackground !== 'solid' && zoom >= 10) {
            const imageURL = `https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/png_tiles/${selectedBackground}/tile_${tileID}_${selectedBackground}.png`;
            const imageOverlay = L.imageOverlay(imageURL, bounds, {
                opacity: 0.9,
                interactive: false,
                errorOverlayUrl: '',
                crossOrigin: true
            });
            
            imageOverlay.addTo(map);
            layers[task]['tileImageOverlays'][tileID] = imageOverlay;
        }
    });
    
    // Update or remove existing image overlays based on background/zoom changes
    if (forceUpdate) {
        Object.keys(layers[task]['tileImageOverlays']).forEach(tileID => {
            // Remove existing overlay
            if (layers[task]['tileImageOverlays'][tileID]) {
                map.removeLayer(layers[task]['tileImageOverlays'][tileID]);
                delete layers[task]['tileImageOverlays'][tileID];
            }
            
            // Re-add if conditions are right
            if (selectedBackground !== 'solid' && zoom >= 10 && newVisibleTileIds.has(tileID)) {
                const tileData = visibleTiles.find(item => item.feature.properties.ID === tileID);
                if (tileData) {
                    const imageURL = `https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/png_tiles/${selectedBackground}/tile_${tileID}_${selectedBackground}.png`;
                    const imageOverlay = L.imageOverlay(imageURL, tileData.bounds, {
                        opacity: 0.9,
                        interactive: false,
                        errorOverlayUrl: '',
                        crossOrigin: true
                    });
                    
                    imageOverlay.addTo(map);
                    layers[task]['tileImageOverlays'][tileID] = imageOverlay;
                }
            }
        });
    }
    
    // Update the set of visible tile IDs
    layers[task]['visibleTileIds'] = newVisibleTileIds;
    
    // Restore hover state if needed
    if (zoom >= 10 && lastMouseLatLng && isHovering) {
        setTimeout(() => {
            if (map.getZoom() >= 10 && lastMouseLatLng) {
                restoreHoverState(task, lastMouseLatLng);
            }
        }, 20);
    }
}

function restoreHoverState(task, mouseLatLng) {
    if (!layers[task]['tileLayers'] || map.getZoom() < 10) return;
    cancelPendingHide();
    
    // Check each individual tile layer
    for (const tileID in layers[task]['tileLayers']) {
        const tileLayer = layers[task]['tileLayers'][tileID];
        
        tileLayer.eachLayer(function(layer) {
            if (layer.getBounds && layer.getBounds().contains(mouseLatLng)) {
                const feature = layer.feature;

                if (feature) {
                    const bounds = layer.getBounds();
                    hoveredTileBounds = bounds;
                    isHovering = true;
                    const topLeft = bounds.getNorthWest();
                    const point = map.latLngToContainerPoint(topLeft);
                    
                    hoverPanel.style.display = 'block';
                    hoverPanel.style.left = `${point.x}px`;
                    hoverPanel.style.top = point.y > 0 ? `${point.y}px` : '0px';
                    const taskData = getTaskData(task, feature.properties);
                    taskValue.innerHTML = (taskData || '').replace(/\n/g, '<br>');
                    tileLevelModalities.innerText = getTileLevelData(feature.properties) || '';
                    
                    if (task == 'biomass') {
                        biomassValuesContainer.style.display = 'flex';
                    }
                    
                    preventHoverPanelSpill();
                    return false;
                }
            }
        });
    }
}

async function loadAndDisplayTasks() {
	for (const task of checkedTasks) {
		await loadTaskLayers(task); // loads the task data
		showVisibleTiles(task, selectedBackground, true); // shows the tiles for the task
	}
	
	document.getElementById('loading-overlay').style.display = 'none'; 	// hides loading overlay after all tasks are loaded
}

function hideTask(task) {
	if (!layers[task]) return; // if the task data isn't loaded yet, return
	
	// Remove all individual tile layers
	if (layers[task]['tileLayers']) {
		Object.values(layers[task]['tileLayers']).forEach(tileLayer => {
			map.removeLayer(tileLayer);
		});
		layers[task]['tileLayers'] = {};
	}
	
	// Remove all individual tile image overlays
	if (layers[task]['tileImageOverlays']) {
		Object.values(layers[task]['tileImageOverlays']).forEach(overlay => {
			map.removeLayer(overlay);
		});
		layers[task]['tileImageOverlays'] = {};
	}
	
	// Clear visible tile IDs
	if (layers[task]['visibleTileIds']) {
		layers[task]['visibleTileIds'].clear();
	}
	
	// Remove biomass image overlays (only for biomass task)
	if (task === 'biomass' && layers[task]['biomassImageOverlays']) {
		layers[task]['biomassImageOverlays'].forEach(overlay => {
			map.removeLayer(overlay);
		});
		layers[task]['biomassImageOverlays'] = null;
	}
	
	hideHoverPanel(); // hides hover panel if hovering over this task's tiles
}

function hideHoverPanel() {
    hoverPanel.style.display = 'none';
	biomassValuesContainer.style.display = 'none';
	isHovering = false;
	
	// Clear any pending hide timeout
	cancelPendingHide();
}

function moveHoverPanel() {
	const topLeft = hoveredTileBounds.getNorthWest();
	const point = map.latLngToContainerPoint(topLeft);

	// move the hover panel to the right position
	hoverPanel.style.left = `${point.x}px`;
	hoverPanel.style.top = point.y > 0 ? `${point.y}px` : '0px';

	preventHoverPanelSpill();
}

Stadia_OSMBright.addTo(map);

map.createPane('borderPane');
map.getPane('borderPane').style.zIndex = 400; // lower z-index for borders

map.createPane('hoverPanelPane');
map.getPane('hoverPanelPane').style.zIndex = 650; // higher z-index for tooltips
map.getPane('hoverPanelPane').style.pointerEvents = 'all';

loadAndDisplayTasks();

// Track if we're currently hovering
let isHovering = false;
let lastMouseLatLng = null;
let hideTimeout = null; // Timeout for delayed hide

// Helper function to cancel any pending hide timeout
function cancelPendingHide() {
	if (hideTimeout) {
		clearTimeout(hideTimeout);
		hideTimeout = null;
	}
}

map.on('mousemove', function(e) { // whenever the mouse moves
	const zoom = map.getZoom();
	lastMouseLatLng = e.latlng; // Store last mouse position
	
	// Only handle hover if zoom level is >= 10
	if (zoom < 10) {
		if (hoveredTileBounds) {
			hideHoverPanel();
			hoveredTileBounds = null;
			isHovering = false;
		}
		return;
	}
	
	// Check if hovering
	if (hoveredTileBounds) {
		if (hoveredTileBounds.contains(e.latlng)) {
			// Still within bounds, update position
			moveHoverPanel();
		} else {
			// Mouse has left the tile bounds
			// Use a delay to prevent flashing when moving between adjacent tiles
			if (!hideTimeout) {
				hideTimeout = setTimeout(() => {
					hideHoverPanel();
					hoveredTileBounds = null;
					isHovering = false;
					hideTimeout = null;
				}, 150);
			}
		}
	}
});

document.getElementById("world-map").addEventListener("click", function() {
	Esri_WorldImagery.remove();
	Stadia_OSMBright.addTo(map);
});

document.getElementById("satellite").addEventListener("click", function() {
	Stadia_OSMBright.remove();
	Esri_WorldImagery.addTo(map);
});

document.getElementById("clear").addEventListener("click", function() {
	Stadia_OSMBright.remove();
	Esri_WorldImagery.remove();
});

// task buttons clicked
for (const task of Object.keys(tasks)) {
	document.getElementById(task).addEventListener("change", async function(e) {
		checkedTasks = Array.from(document.querySelectorAll('input[name="task"]:checked')).map(checkbox => checkbox.id);

		if (e.target.checked) { // if task checkbox checked
			// Load the task data if not already loaded
			if (!layers[task]['tilesWithBounds']) {
				await loadTaskLayers(task);
			}
			// Show the tiles for this task
			showVisibleTiles(task, selectedBackground, true);
		} else { // if task checkbox unchecked
			// Hide all tiles and overlays for this task
			hideTask(task);
		}
	});
}

// modality buttons clicked
document.querySelectorAll('input[name="pixel-level-modalities"]').forEach(radio => {
    radio.addEventListener('change', () => {
		selectedBackground = document.querySelector('input[name="pixel-level-modalities"]:checked').id;
		console.log(`Modality changed to: ${selectedBackground}`);

		// Hide all legends first
		dynamicWorldLegend.style.display = 'none';
		esaWorldCoverLegend.style.display = 'none';
		mskCldprbLegend.style.display = 'none';
		s2cloudlessLegend.style.display = 'none';
		sclLegend.style.display = 'none';
		ethGchLegend.style.display = 'none';
		
		// Show the appropriate legend
		if (selectedBackground === 'DynamicWorld') {
			dynamicWorldLegend.style.display = 'block';
		} else if (selectedBackground === 'ESA_WorldCover') {
			esaWorldCoverLegend.style.display = 'block';
		} else if (selectedBackground === 'MSK_CLDPRB') {
			mskCldprbLegend.style.display = 'block';
		} else if (selectedBackground === 'S2CLOUDLESS') {
			s2cloudlessLegend.style.display = 'block';
		} else if (selectedBackground === 'SCL') {
			sclLegend.style.display = 'block';
		} else if (selectedBackground === 'ETH_GCH') {
			ethGchLegend.style.display = 'block';
		}

		for (const task of checkedTasks) {
			showVisibleTiles(task, selectedBackground, true); // force update
		}
    });
});

hoverPanel.addEventListener('mouseenter', function () {
    map.scrollWheelZoom.disable(); // disables scroll zoom on the map
});

hoverPanel.addEventListener('mouseleave', function () {
    map.scrollWheelZoom.enable(); // enables scroll zoom on the map
});

// add event listener for the tile level modality checkbox
tileLevelModalityCheckbox.addEventListener('change', function () {
    if (tileLevelModalityCheckbox.checked) {
        tileLevelModalities.style.display = 'block';
    } else {
        tileLevelModalities.style.display = 'none';
    }
});

// add event listener for the biomass values checkbox
biomassValuesCheckbox.addEventListener('change', function () {
	if (biomassValuesCheckbox.checked) {
		biomassLegend.style.display = 'block';
		updateBiomassOverlays();
	} else {
		biomassLegend.style.display = 'none';
		
		// Remove biomass image overlays
		if (layers['biomass'] && layers['biomass']['biomassImageOverlays']) {
			layers['biomass']['biomassImageOverlays'].forEach(overlay => {
				map.removeLayer(overlay);
			});
			layers['biomass']['biomassImageOverlays'] = [];
		}
	}
});

// Use requestAnimationFrame for smoother updates with throttling
function rafThrottle(func) {
	let rafId = null;
	let lastArgs = null;
	let lastCall = 0;
	
	return function(...args) {
		lastArgs = args;
		
		if (rafId === null) {
			rafId = requestAnimationFrame(() => {
				const now = Date.now();
				// Only execute if enough time has passed (200ms) to prevent blinking
				if (now - lastCall >= 200) {
					// Don't update layers if user is hovering at zoom >= 10
					if (!(isHovering && map.getZoom() >= 10)) {
						func(...lastArgs);
						lastCall = now;
					}
				}
				rafId = null;
			});
		}
	};
}

// Use regular throttle for zoom events (less frequent)
function throttle(func, wait) {
	let timeout;
	let lastCall = 0;
	return function(...args) {
		const now = Date.now();
		const timeSinceLastCall = now - lastCall;
		
		if (timeSinceLastCall >= wait) {
			// Enough time has passed, execute immediately
			lastCall = now;
			func(...args);
		} else {
			// Schedule for later, but cancel previous timeout
			clearTimeout(timeout);
			timeout = setTimeout(() => {
				lastCall = Date.now();
				func(...args);
			}, wait - timeSinceLastCall);
		}
	};
}

// Use requestAnimationFrame for move events (smoother)
const rafUpdate = rafThrottle(() => {
	// Check is now in rafThrottle function
	for (const task of checkedTasks) {
		showVisibleTiles(task, selectedBackground);
	}
	// Update biomass overlays if showing biomass values
	updateBiomassOverlays();
});

// Function to update zoom level display
function updateZoomLevel() {
	const zoom = map.getZoom();
	zoomLevelValue.textContent = Math.round(zoom);
}

// Use throttle for zoom events (less frequent, but still responsive)
const throttledZoomUpdate = throttle(() => {
	const zoom = map.getZoom();
	
	// Show/hide pixel-level modalities based on zoom level
	if (zoom >= 10) {
		pixelLevelModalitiesContainer.style.display = 'block';
		zoomInstruction.style.display = 'none';
		
		// Update hover panel position if hovering
		if (hoveredTileBounds) {
			moveHoverPanel();
		}
	} else {
		// Hide pixel-level modalities and hover panel below zoom 10
		pixelLevelModalitiesContainer.style.display = 'none';
		zoomInstruction.style.display = 'block';
		
		// Hide hover panel and reset state
		hideHoverPanel();
		hoveredTileBounds = null;
		isHovering = false;
		
		// Hide all modality legends when zooming out
		dynamicWorldLegend.style.display = 'none';
		esaWorldCoverLegend.style.display = 'none';
		mskCldprbLegend.style.display = 'none';
		s2cloudlessLegend.style.display = 'none';
		sclLegend.style.display = 'none';
		ethGchLegend.style.display = 'none';
		
		// Reset to solid background if pixel-level modality was selected
		if (selectedBackground !== 'solid') {
			selectedBackground = 'solid';
			document.querySelector('input[name="pixel-level-modalities"][id="solid"]').checked = true;
		}
	}
	
	for (const task of checkedTasks) {
		showVisibleTiles(task, selectedBackground);
	}
	// Update biomass overlays if showing biomass values
	updateBiomassOverlays();
	updateZoomLevel();
}, 150);

// Update during move using requestAnimationFrame for smoothness
map.on('move', rafUpdate);
map.on('moveend', rafUpdate);
map.on('zoomend', throttledZoomUpdate);
map.on('zoom', updateZoomLevel); // Update zoom level display during zoom animation

// Set initial zoom level display and pixel-level modalities visibility
updateZoomLevel();

// Initialize pixel-level modalities visibility based on current zoom
if (map.getZoom() >= 10) {
	pixelLevelModalitiesContainer.style.display = 'block';
	zoomInstruction.style.display = 'none';
} else {
	pixelLevelModalitiesContainer.style.display = 'none';
	zoomInstruction.style.display = 'block';
}
