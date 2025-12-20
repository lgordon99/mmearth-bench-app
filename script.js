let map = L.map('map', {
	fadeAnimation: false, // makes tiles appear instantly, not with a fade-in
	zoomAnimation: true, // keeps zoom animation
	markerZoomAnimation: false, // prevents markers from zooming in and out with the map
	minZoom: 1, // prevent zooming to level 0
	maxBounds: L.latLngBounds([[-90, -180], [90, 180]]), // restrict panning to world bounds
	maxBoundsViscosity: 1.0, // prevent dragging past edges (1.0 = strict enforcement)
	worldCopyJump: false // prevent jumping to world copy when panning
}).setView([0, 0], 2); // sets center and initial zoom

// Add scale control in bottom left corner
L.control.scale({
	position: 'bottomleft',
	imperial: false, // metric only
	maxWidth: 200
}).addTo(map);

// Prevent dragging past map edges by constraining during drag
map.on('drag', function() {
	const maxBounds = map.options.maxBounds;
	if (maxBounds) {
		// Constrain the map to stay within bounds during dragging
		map.panInsideBounds(maxBounds, { animate: false });
	}
});

// Backgrounds
let Stadia_OSMBright = L.tileLayer('https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.{ext}', {
	minZoom: 1,
	maxZoom: 20,
	attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	ext: 'png',
});
let Esri_WorldImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
	minZoom: 1,
	maxZoom: 19,
	attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

const tasks = {'biomass': {'title': 'Biomass', 'color': 'green'},
               'soil_nitrogen': {'title': 'Soil nitrogen', 'color': 'blue'},
			   'soil_organic_carbon': {'title': 'Soil organic carbon', 'color': 'brown'},
			   'soil_pH': {'title': 'Soil pH', 'color': 'purple'},
               'species': {'title': 'Species', 'color': 'red'}};
const layers = Object.fromEntries(Object.keys(tasks).map(task => [task, {}]));
const viewportHeight = window.innerHeight;
const zoomInstruction = document.getElementById('zoom-instruction');
const zoomLevelValue = document.getElementById('zoom-level-value');
const pixelLevelModalitiesContainer = document.getElementById('pixel-level-modalities-container');
const pixelLevelModalities =['Sentinel2', 'Sentinel1', 'ETH_GCH', 'DynamicWorld', 'ESA_WorldCover', 'MSK_CLDPRB', 'S2CLOUDLESS', 'SCL']
const PIXEL_LEVEL_ZOOM_THRESHOLD = 10; // Zoom level at which pixel-level modalities are shown
const hoverPanel = document.getElementById('hover-panel');
const taskValue = document.getElementById('task-value');
const tileLevelModalities = document.getElementById('tile-level-modalities-data');
const tileLevelModalityCheckbox = document.getElementById('tile-level-modalities-checkbox');
const biomassValuesContainer = document.getElementById('biomass-values-container');
const biomassValuesCheckbox = document.getElementById('biomass-values-checkbox');
const biomassLegend = document.getElementById('biomass-legend');
const dynamicWorldLegend = document.getElementById('dynamicworld-legend');
const asterGdemLegend = document.getElementById('astergdem-legend');
const sentinel1Legend = document.getElementById('sentinel1-legend');
const esaWorldCoverLegend = document.getElementById('esa-worldcover-legend');
const mskCldprbLegend = document.getElementById('msk-cldprb-legend');
const s2cloudlessLegend = document.getElementById('s2cloudless-legend');
const sclLegend = document.getElementById('scl-legend');
const ethGchLegend = document.getElementById('eth-gch-legend');
const speciesSelect = document.getElementById('species-select');
let speciesLabels = {}; // Will store the species name to index mapping
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
	
	// Get selected split indices
	const selectedIndices = getSelectedSplitIndices('biomass');
	
	// Filter visible features by bounds and split
	let visibleTiles = tilesWithBounds
		.filter(item => visibleBounds.intersects(item.bounds));
	
	// Filter by split indices if splits are loaded
	if (selectedIndices !== null) {
		if (selectedIndices.size === 0) {
			// No splits selected - show nothing
			visibleTiles = [];
		} else {
			// Filter by selected split indices
			visibleTiles = visibleTiles.filter(item => selectedIndices.has(item.index));
		}
	}
	
	visibleTiles = visibleTiles.map(item => item.feature);
	
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
	// Get map dimensions and viewport height
	const mapRect = document.getElementById('map').getBoundingClientRect();
	const viewportHeight = window.innerHeight;
	
	// Get current top position from style (parse '123px' to 123)
	const currentTop = parseInt(hoverPanel.style.top) || 0;
	
	// Calculate panel's top position relative to viewport
	// panelTop_viewport = mapTop_viewport + panelTop_relative_to_map
	const panelTopViewport = mapRect.top + currentTop;
	
	// Check if any legend is visible and calculate available space above it
	let bottomBoundary = Math.min(mapRect.bottom, viewportHeight) - 20;
	
	// Find Leaflet attribution control (typically at bottom-right)
	const attributionControl = document.querySelector('.leaflet-control-attribution');
	if (attributionControl && attributionControl.offsetParent !== null) {
		const attributionRect = attributionControl.getBoundingClientRect();
		const attributionTopRelativeToMap = attributionRect.top - mapRect.top;
		// If attribution is below the hover panel, use it as boundary
		if (attributionTopRelativeToMap > currentTop) {
			const attributionBoundary = attributionTopRelativeToMap - 10; // 10px buffer above attribution
			bottomBoundary = Math.min(bottomBoundary, attributionBoundary);
		}
	}
	
	const visibleLegends = document.querySelectorAll('.legend');
	visibleLegends.forEach(legend => {
		if (legend.style.display !== 'none' && legend.offsetParent !== null) {
			const legendRect = legend.getBoundingClientRect();
			// Calculate legend's top position relative to map
			const legendTopRelativeToMap = legendRect.top - mapRect.top;
			// If legend is visible and below the hover panel
			if (legendTopRelativeToMap > currentTop) {
				// Use the legend's top as the boundary (with buffer)
				const legendBoundary = legendTopRelativeToMap - 10; // 10px buffer above legend
				// Use the smaller boundary (legend top or map bottom)
				bottomBoundary = Math.min(bottomBoundary, legendBoundary);
			}
		}
	});
	
	// Calculate available height from panel top to boundary
	const availableHeight = bottomBoundary - currentTop;
	
	// Apply max-height (box-sizing: border-box in CSS handles padding/border)
	if (availableHeight > 0) {
		hoverPanel.style.setProperty('max-height', `${availableHeight}px`, 'important');
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

function getSelectedSplitIndices(task) {
	if (!layers[task] || !layers[task]['splitData']) return null;
	
	const splitData = layers[task]['splitData'];
	let allIndices = new Set();
	
	// Check which splits are selected
	const trainCheckbox = document.getElementById('train');
	const validationCheckbox = document.getElementById('validation');
	const randomTestCheckbox = document.getElementById('random-test');
	const geographicTestCheckbox = document.getElementById('geographic-test');
	const trainSelect = document.getElementById('train-select');
	
	// Add train indices based on selected percentage
	if (trainCheckbox && trainCheckbox.checked && trainSelect) {
		const trainPercentage = trainSelect.value; // 'train-100', 'train-50', or 'train-5'
		let splitKey;
		if (trainPercentage === 'train-100') splitKey = 'train_100%_indices';
		else if (trainPercentage === 'train-50') splitKey = 'train_50%_indices';
		else if (trainPercentage === 'train-5') splitKey = 'train_5%_indices';
		
		if (splitKey && splitData[splitKey]) {
			splitData[splitKey].forEach(idx => allIndices.add(idx));
		}
	}
	
	// Add validation indices
	if (validationCheckbox && validationCheckbox.checked && splitData['val_indices']) {
		splitData['val_indices'].forEach(idx => allIndices.add(idx));
	}
	
	// Add random test indices
	if (randomTestCheckbox && randomTestCheckbox.checked && splitData['random_test_indices']) {
		splitData['random_test_indices'].forEach(idx => allIndices.add(idx));
	}
	
	// Add geographic test indices
	if (geographicTestCheckbox && geographicTestCheckbox.checked && splitData['geographic_test_indices']) {
		splitData['geographic_test_indices'].forEach(idx => allIndices.add(idx));
	}
	
	return allIndices;
}

async function loadTaskLayers(task) {
	const response = await fetch(`https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/${task}_map_gdf.geojson`);
	const data = await response.json();
	const color = tasks[task]['color'];

	// Load split data
	const splitResponse = await fetch(`https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/${task}_split_data.json`);
	const splitData = await splitResponse.json();

	// Pre-calculate bounds for all tiles to avoid recalculating during panning
	const tilesWithBounds = data.features.map((tile, index) => {
		// Extract bounds directly from geometry coordinates (more efficient than creating GeoJSON layer)
		const coords = tile.geometry.coordinates[0]; // Get the outer ring
		let minLat = Infinity, maxLat = -Infinity;
		let minLng = Infinity, maxLng = -Infinity;
		
		coords.forEach(coord => {
			const [lng, lat] = coord;
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
			if (lng < minLng) minLng = lng;
			if (lng > maxLng) maxLng = lng;
		});
		
		return {
			feature: tile,
			bounds: L.latLngBounds([[minLat, minLng], [maxLat, maxLng]]), // Create Leaflet LatLngBounds object
			index: index // Store original index for split filtering
		};
	});

	// Store the pre-calculated data
	layers[task]['allData'] = data;
	layers[task]['tilesWithBounds'] = tilesWithBounds; // Store pre-calculated bounds
	layers[task]['splitData'] = splitData; // Store split indices
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

    const selectedIndices = getSelectedSplitIndices(task);
    
    // Get currently visible tile IDs, filtered by split
    let visibleTiles = tilesWithBounds.filter(item => visibleBounds.intersects(item.bounds));
    
    // Filter by split indices if splits are loaded
    if (selectedIndices !== null) {
        if (selectedIndices.size === 0) {
            // No splits selected - show nothing
            visibleTiles = [];
        } else {
            // Filter by selected split indices
            visibleTiles = visibleTiles.filter(item => selectedIndices.has(item.index));
        }
    }
    
    // Filter by species if a specific species is selected (only for species task)
    if (task === 'species' && speciesSelect && speciesSelect.value && speciesSelect.value !== 'all') {
        const selectedSpecies = speciesSelect.value;
        visibleTiles = visibleTiles.filter(item => {
            const tileSpecies = item.feature.properties.species;
            // Check if the selected species is in the tile's species array
            if (Array.isArray(tileSpecies)) {
                return tileSpecies.includes(selectedSpecies);
            }
            return false;
        });
    }
    
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
    
    // If forcing update, update styles of all existing tiles
    if (forceUpdate) {
        Object.values(layers[task]['tileLayers']).forEach(tileLayer => {
            tileLayer.setStyle({
                fillColor: (selectedBackground === 'solid' && !(task === 'biomass' && biomassValuesCheckbox.checked)) ? color : 'transparent',
                color: color,
                weight: lineWeight,
                fillOpacity: fillOpacity
            });
        });
    }
    
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
                fillColor: (selectedBackground === 'solid' && !(task === 'biomass' && biomassValuesCheckbox.checked)) ? color : 'transparent',
                color: color,
                weight: lineWeight,
                fillOpacity: fillOpacity,
                interactive: true
            },
            onEachFeature: function(feature, layer) {
                layer.on({
                    mouseover: function(e) {
                        if (map.getZoom() < PIXEL_LEVEL_ZOOM_THRESHOLD) return;
                        
                        cancelPendingHide();
                        
                        const tile = e.target;
                        const bounds = tile.getBounds();
                        hoveredTileBounds = bounds;
                        isHovering = true;
                        const taskData = getTaskData(task, feature.properties);
                        const tileLevelData = getTileLevelData(feature.properties);
                        showHoverPanel(e, taskData, tileLevelData);
                    },
                    touchstart: function(e) {
                        if (map.getZoom() < PIXEL_LEVEL_ZOOM_THRESHOLD) return;
                        
                        e.originalEvent.preventDefault(); // Prevent default touch behavior
                        cancelPendingHide();
                        
                        isTouchOverTile = true;
                        const tile = e.target;
                        const bounds = tile.getBounds();
                        hoveredTileBounds = bounds;
                        isHovering = true;
                        const taskData = getTaskData(task, feature.properties);
                        const tileLevelData = getTileLevelData(feature.properties);
                        showHoverPanel(e, taskData, tileLevelData);
                    },
                    touchmove: function(e) {
                        if (map.getZoom() < PIXEL_LEVEL_ZOOM_THRESHOLD) return;
                        
                        // If touch is moving on panel, prevent tile panning
                        if (isTouchOverPanel) {
                            e.originalEvent.preventDefault();
                            e.originalEvent.stopPropagation();
                            return;
                        }
                        // If touch is moving on tile, allow normal behavior (but panel scrolling will be handled by panel)
                    },
                    touchend: function(e) {
                        isTouchOverTile = false;
                        
                        // Check if touch ended outside tile and panel
                        if (hoveredTileBounds && e.originalEvent.changedTouches.length > 0) {
                            const touch = e.originalEvent.changedTouches[0];
                            const mapContainer = map.getContainer();
                            const rect = mapContainer.getBoundingClientRect();
                            const x = touch.clientX - rect.left;
                            const y = touch.clientY - rect.top;
                            const touchLatLng = map.containerPointToLatLng(L.point(x, y));
                            
                            if (!hoveredTileBounds.contains(touchLatLng) && !isTouchOverPanel) {
                                // Touch ended outside tile and panel, hide after a short delay
                                if (!hideTimeout) {
                                    hideTimeout = setTimeout(() => {
                                        if (!isTouchOverPanel && !isTouchOverTile) {
                                            hideHoverPanel();
                                            hoveredTileBounds = null;
                                            isHovering = false;
                                        }
                                        hideTimeout = null;
                                    }, 150);
                                }
                            }
                        }
                    }
                });
            }
        });
        
        tileLayer.addTo(map);
        layers[task]['tileLayers'][tileID] = tileLayer;
        
        // Add pixel-level modality image overlay if needed
        if (selectedBackground !== 'solid' && zoom >= PIXEL_LEVEL_ZOOM_THRESHOLD) {
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
        // First, remove all existing overlays
        Object.keys(layers[task]['tileImageOverlays']).forEach(tileID => {
            if (layers[task]['tileImageOverlays'][tileID]) {
                map.removeLayer(layers[task]['tileImageOverlays'][tileID]);
                delete layers[task]['tileImageOverlays'][tileID];
            }
        });
        
        // Then, add overlays for all currently visible tiles
        if (selectedBackground !== 'solid' && zoom >= PIXEL_LEVEL_ZOOM_THRESHOLD) {
            visibleTiles.forEach(tileData => {
                const tileID = tileData.feature.properties.ID;
                const imageURL = `https://mmearth-bench-bucket-a1e1664c.s3.eu-west-1.amazonaws.com/${task}/png_tiles/${selectedBackground}/tile_${tileID}_${selectedBackground}.png`;
                const imageOverlay = L.imageOverlay(imageURL, tileData.bounds, {
                    opacity: 0.9,
                    interactive: false,
                    errorOverlayUrl: '',
                    crossOrigin: true
                });
                
                imageOverlay.addTo(map);
                layers[task]['tileImageOverlays'][tileID] = imageOverlay;
            });
        }
    }
    
    layers[task]['visibleTileIds'] = newVisibleTileIds; // updates the set of visible tile IDs
    
    // Restore hover state if needed
    if (zoom >= PIXEL_LEVEL_ZOOM_THRESHOLD && lastMouseLatLng && isHovering) {
        setTimeout(() => {
            if (map.getZoom() >= PIXEL_LEVEL_ZOOM_THRESHOLD && lastMouseLatLng) {
                restoreHoverState(task, lastMouseLatLng);
            }
        }, 20);
    }
}

function restoreHoverState(task, mouseLatLng) {
    if (!layers[task]['tileLayers'] || map.getZoom() < PIXEL_LEVEL_ZOOM_THRESHOLD) return;
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
	const loadingText = document.getElementById('loading-text');
	loadingText.innerText = `Loading tiles...`;
	loadingText.style.color = '#333';
	
	await Promise.all(checkedTasks.map(task => loadTaskLayers(task))); // loads all tasks in parallel for maximum speed

	checkedTasks.forEach(task => showVisibleTiles(task, selectedBackground, true)); // displays all tasks after they're loaded
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

// Load species labels and populate dropdown
async function loadSpeciesLabels() {
	if (!speciesSelect) {
		console.error('Species select element not found');
		return;
	}
	
	try {
		const response = await fetch('https://mmearth-bench-bucket-a1e1664c.s3.amazonaws.com/species/species_labels.json');
		speciesLabels = await response.json();
		
		// Populate the dropdown with species in order
		const speciesNames = Object.keys(speciesLabels);
		speciesNames.forEach(speciesName => {
			const option = document.createElement('option');
			option.value = speciesName;
			option.textContent = speciesName;
			speciesSelect.appendChild(option);
		});
	} catch (error) {
		console.error('Error loading species labels:', error);
	}
}

// Load species labels first, then load tasks
(async function init() {
	await loadSpeciesLabels();
	await loadAndDisplayTasks();
})().catch(error => {
	console.error('Error during initialization:', error);
});

// Track if we're currently hovering
let isHovering = false;
let lastMouseLatLng = null;
let hideTimeout = null; // Timeout for delayed hide
let isMouseOverPanel = false; // Track if mouse is over the hover panel
let isTouchOverPanel = false; // Track if touch is over the hover panel
let isTouchOverTile = false; // Track if touch is over a tile
let touchStartY = null; // Track touch start position for scrolling (hover panel)
let controlPanelTouchStartY = null; // Track touch start position for scrolling (control panel)

// Helper function to cancel any pending hide timeout
function cancelPendingHide() {
	if (hideTimeout) {
		clearTimeout(hideTimeout);
		hideTimeout = null;
	}
}

// Handle touch events on the map to detect touches outside tile/panel
map.on('touchstart', function(e) {
	// Only handle if zoom level is >= PIXEL_LEVEL_ZOOM_THRESHOLD
	if (map.getZoom() < PIXEL_LEVEL_ZOOM_THRESHOLD) return;
	
	// Only handle if hover panel is visible
	if (hoverPanel.style.display === 'none' || !hoveredTileBounds) return;
	
	const touch = e.originalEvent.touches[0];
	if (!touch) return;
	
	// Check if touch is within the hover panel element
	const hoverPanelRect = hoverPanel.getBoundingClientRect();
	const isTouchInPanel = hoverPanel.style.display !== 'none' &&
	                       touch.clientX >= hoverPanelRect.left && 
	                       touch.clientX <= hoverPanelRect.right &&
	                       touch.clientY >= hoverPanelRect.top && 
	                       touch.clientY <= hoverPanelRect.bottom;
	
	// If touch is in panel, don't hide
	if (isTouchInPanel) {
		return;
	}
	
	const mapContainer = map.getContainer();
	const rect = mapContainer.getBoundingClientRect();
	const x = touch.clientX - rect.left;
	const y = touch.clientY - rect.top;
	const touchLatLng = map.containerPointToLatLng(L.point(x, y));
	
	// Check if touch is outside any tile and outside the panel
	if (!hoveredTileBounds.contains(touchLatLng)) {
		// Touch is outside tile and panel, hide immediately
		hideHoverPanel();
		hoveredTileBounds = null;
		isHovering = false;
		cancelPendingHide();
	}
});

map.on('mousemove', function(e) { // whenever the mouse moves
	const zoom = map.getZoom();
	lastMouseLatLng = e.latlng; // Store last mouse position
	
	// Only handle hover if zoom level is >= PIXEL_LEVEL_ZOOM_THRESHOLD
	if (zoom < PIXEL_LEVEL_ZOOM_THRESHOLD) {
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
		} else if (!isMouseOverPanel) {
			// Mouse has left the tile bounds and is not over the panel
			// Use a delay to prevent flashing when moving between adjacent tiles
			if (!hideTimeout) {
				hideTimeout = setTimeout(() => {
					// Only hide if mouse is still not over the panel
					if (!isMouseOverPanel) {
						hideHoverPanel();
						hoveredTileBounds = null;
						isHovering = false;
					}
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

// Control panel toggle
const showMenuBtn = document.getElementById('show-menu-btn');
const hideMenuBtn = document.getElementById('hide-menu-btn');
const controlPanel = document.getElementById('control-panel');
const controlPanelToggle = document.getElementById('control-panel-toggle');

// Function to sync toggle width with control panel and position control panel below toggle
function preventControlPanelOverlap() {
	if (!controlPanel || !controlPanel.classList.contains('visible')) {
		return; // Only check when visible
	}
	
	// Get map dimensions and viewport height
	const mapRect = document.getElementById('map').getBoundingClientRect();
	const viewportHeight = window.innerHeight;
	
	// Get control panel position
	const panelRect = controlPanel.getBoundingClientRect();
	const panelTop = panelRect.top - mapRect.top; // Top relative to map
	
	// Find Leaflet attribution control (typically at bottom-right)
	const attributionControl = document.querySelector('.leaflet-control-attribution');
	let bottomBoundary = Math.min(mapRect.bottom, viewportHeight) - 20; // 20px buffer from bottom
	
	// Check if attribution control exists and is visible
	if (attributionControl && attributionControl.offsetParent !== null) {
		const attributionRect = attributionControl.getBoundingClientRect();
		const attributionTopRelativeToMap = attributionRect.top - mapRect.top;
		
		// If attribution is below the control panel, use it as boundary
		if (attributionTopRelativeToMap > panelTop) {
			bottomBoundary = Math.min(bottomBoundary, attributionTopRelativeToMap - 10); // 10px buffer above attribution
		}
	}
	
	// Check if any legend is visible and adjust bottom boundary
	const visibleLegends = document.querySelectorAll('.legend');
	visibleLegends.forEach(legend => {
		if (legend.style.display !== 'none' && legend.offsetParent !== null) {
			const legendRect = legend.getBoundingClientRect();
			// Calculate legend's top position relative to map
			const legendTopRelativeToMap = legendRect.top - mapRect.top;
			// If legend is visible and below the control panel
			if (legendTopRelativeToMap > panelTop) {
				// Use the legend's top as the boundary (with buffer)
				const legendBoundary = legendTopRelativeToMap - 10; // 10px buffer above legend
				// Use the smaller boundary (legend top, attribution top, or map bottom)
				bottomBoundary = Math.min(bottomBoundary, legendBoundary);
			}
		}
	});
	
	// Calculate available height from panel top to boundary
	const availableHeight = bottomBoundary - panelTop;
	
	// Get the natural height of the control panel (when not restricted)
	// Temporarily remove max-height to measure natural height
	const currentMaxHeight = controlPanel.style.maxHeight;
	controlPanel.style.maxHeight = 'none';
	const naturalHeight = controlPanel.scrollHeight;
	// Restore the original max-height style (or remove if it was empty)
	if (currentMaxHeight) {
		controlPanel.style.maxHeight = currentMaxHeight;
	} else {
		controlPanel.style.removeProperty('max-height');
	}
	
	// If natural height exceeds available space, restrict and make scrollable
	if (naturalHeight > availableHeight && availableHeight > 0) {
		controlPanel.style.setProperty('max-height', `${availableHeight}px`, 'important');
		controlPanel.classList.add('scrollable');
	} else {
		// Remove max-height restriction (let CSS class handle it) and scrollable class if not needed
		controlPanel.style.removeProperty('max-height');
		controlPanel.classList.remove('scrollable');
	}
}

function syncToggleWidth() {
	if (controlPanelToggle && controlPanel) {
		// Temporarily make control panel visible to measure width if it's hidden
		const wasHidden = !controlPanel.classList.contains('visible');
		if (wasHidden) {
			controlPanel.style.visibility = 'hidden';
			controlPanel.style.maxHeight = 'none';
			controlPanel.style.opacity = '1';
			controlPanel.style.display = 'block';
		}
		
		// Force a layout recalculation by reading offsetWidth
		controlPanel.offsetWidth;
		
		// Get control panel width (including padding and border due to box-sizing: border-box)
		const panelWidth = controlPanel.offsetWidth;
		
		// Set toggle width to match (only if we got a valid width)
		if (panelWidth > 0) {
			controlPanelToggle.style.width = panelWidth + 'px';
		}
		
		// Position control panel directly below toggle
		const toggleHeight = controlPanelToggle.offsetHeight;
		controlPanel.style.top = (10 + toggleHeight) + 'px';
		
		// Restore hidden state if it was hidden
		if (wasHidden) {
			controlPanel.style.visibility = '';
			controlPanel.style.maxHeight = '';
			controlPanel.style.opacity = '';
			controlPanel.style.display = '';
		}
	}
}

if (showMenuBtn && hideMenuBtn && controlPanel && controlPanelToggle) {
	// Sync width and position after DOM is ready
	function initToggleWidth() {
		// Use requestAnimationFrame to ensure layout is calculated
		requestAnimationFrame(() => {
			syncToggleWidth();
		});
	}
	
	// Initialize on load
	function initializeControlPanel() {
		// First, sync width before applying any animation classes
		// Temporarily remove animation classes to measure natural width
		controlPanel.style.transition = 'none';
		controlPanel.style.maxHeight = 'none';
		controlPanel.style.opacity = '1';
		controlPanel.style.visibility = 'visible';
		controlPanel.style.display = 'block'; // Ensure it's displayed for measurement
		
		// Force a layout recalculation by reading offsetWidth
		controlPanel.offsetWidth;
		
		// Use multiple requestAnimationFrame calls to ensure layout is fully calculated
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					// Measure and sync width
					syncToggleWidth();
					
					// Now restore transitions and set initial state
					controlPanel.style.transition = '';
					controlPanel.style.visibility = '';
					controlPanel.style.maxHeight = '';
					controlPanel.style.opacity = '';
					
					// Set initial state based on which button is active
					if (showMenuBtn.classList.contains('active')) {
						controlPanel.classList.add('visible');
						// Check for overlap after a short delay to ensure layout is complete
						setTimeout(() => {
							preventControlPanelOverlap();
						}, 450);
					} else {
						// Ensure it starts hidden if hide is active
						controlPanel.style.display = 'none';
						controlPanel.classList.remove('visible');
					}
				});
			});
		});
	}
	
	// Allow scrolling within the control panel when it's scrollable
	controlPanel.addEventListener('wheel', function(e) {
		if (controlPanel.classList.contains('scrollable')) {
			// Manually scroll the panel
			controlPanel.scrollTop += e.deltaY;
			
			// Prevent the event from doing anything else (like zooming the map)
			e.preventDefault();
			e.stopPropagation();
		}
	}, { passive: false });
	
	// Touch event handlers for control panel scrolling
	controlPanel.addEventListener('touchstart', function(e) {
		if (controlPanel.classList.contains('scrollable')) {
			controlPanelTouchStartY = e.touches[0].clientY;
		}
	}, { passive: true });
	
	controlPanel.addEventListener('touchmove', function(e) {
		if (controlPanel.classList.contains('scrollable') && controlPanelTouchStartY !== null && e.touches.length === 1) {
			const deltaY = controlPanelTouchStartY - e.touches[0].clientY;
			controlPanel.scrollTop += deltaY;
			controlPanelTouchStartY = e.touches[0].clientY;
			e.preventDefault(); // Prevent map panning when scrolling panel
		}
	}, { passive: false });
	
	controlPanel.addEventListener('touchend', function(e) {
		controlPanelTouchStartY = null;
	}, { passive: true });
	
	// Use ResizeObserver to ensure width stays synced if content size changes
	const resizeObserver = new ResizeObserver(() => {
		requestAnimationFrame(syncToggleWidth);
	});
	resizeObserver.observe(controlPanel);
	
	// Wait for both DOM and window load to ensure everything is rendered
	function waitForFullLoad() {
		if (document.readyState === 'complete') {
			// Use a small delay to ensure all styles are applied
			setTimeout(initializeControlPanel, 0);
		} else {
			window.addEventListener('load', () => {
				setTimeout(initializeControlPanel, 0);
			});
		}
	}
	
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', waitForFullLoad);
	} else {
		waitForFullLoad();
	}
	
	// Sync on window resize
	window.addEventListener('resize', () => {
		syncToggleWidth();
		if (controlPanel.classList.contains('visible')) {
			preventControlPanelOverlap();
		}
	});
	
	// Sync width after control panel is shown
	showMenuBtn.addEventListener('click', function() {
		controlPanel.classList.add('visible');
		showMenuBtn.classList.add('active');
		hideMenuBtn.classList.remove('active');
		// Sync width and position after display change
		requestAnimationFrame(() => {
			syncToggleWidth();
			// Check for overlap after animation completes
			setTimeout(() => {
				preventControlPanelOverlap();
			}, 450); // Slightly longer than animation duration (400ms)
		});
	});
	
	hideMenuBtn.addEventListener('click', function() {
		controlPanel.classList.remove('visible');
		hideMenuBtn.classList.add('active');
		showMenuBtn.classList.remove('active');
	});
}

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

	// If a non-solid background is selected, uncheck biomass values
	if (selectedBackground !== 'solid' && biomassValuesCheckbox.checked) {
		biomassValuesCheckbox.checked = false;
		biomassLegend.style.display = 'none';
		
		// Remove biomass image overlays
		if (layers['biomass'] && layers['biomass']['biomassImageOverlays']) {
			layers['biomass']['biomassImageOverlays'].forEach(overlay => {
				map.removeLayer(overlay);
			});
			layers['biomass']['biomassImageOverlays'] = [];
		}
	}

	// Hide all legends first
	document.querySelectorAll('.legend').forEach(legend => {
		legend.style.display = 'none';
	});
	
	// Show the appropriate legend
	if (selectedBackground === 'DynamicWorld') {
		dynamicWorldLegend.style.display = 'block';
	} else if (selectedBackground === 'ASTER_GDEM') {
		asterGdemLegend.style.display = 'block';
	} else if (selectedBackground === 'Sentinel1') {
		sentinel1Legend.style.display = 'block';
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
	
	// Update control panel height if visible (to account for legend changes)
	if (controlPanel && controlPanel.classList.contains('visible')) {
		requestAnimationFrame(() => {
			preventControlPanelOverlap();
		});
	}

	for (const task of checkedTasks) {
		showVisibleTiles(task, selectedBackground, true); // force update
	}
    });
});

hoverPanel.addEventListener('mouseenter', function () {
    map.scrollWheelZoom.disable(); // disables scroll zoom on the map
    isMouseOverPanel = true; // Mark that mouse is over the panel
    cancelPendingHide(); // Cancel any pending hide timeout
});

// Allow scrolling within the hover panel by manually scrolling it
// This bypasses any event capture issues with Leaflet
hoverPanel.addEventListener('wheel', function(e) {
    // Manually scroll the panel
    hoverPanel.scrollTop += e.deltaY;
    
    // Prevent the event from doing anything else (like zooming the map)
    e.preventDefault();
    e.stopPropagation();
}, { passive: false });

// Touch event handlers for hover panel
hoverPanel.addEventListener('touchstart', function(e) {
    isTouchOverPanel = true;
    cancelPendingHide();
    if (e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        // Prevent map panning when touching the panel
        e.stopPropagation();
    }
}, { passive: false });

hoverPanel.addEventListener('touchmove', function(e) {
    if (touchStartY !== null && e.touches.length === 1) {
        const deltaY = touchStartY - e.touches[0].clientY;
        hoverPanel.scrollTop += deltaY;
        touchStartY = e.touches[0].clientY;
        // Prevent map panning when scrolling panel
        e.preventDefault();
        e.stopPropagation();
    }
}, { passive: false });

hoverPanel.addEventListener('touchend', function(e) {
    isTouchOverPanel = false;
    touchStartY = null;
    
    // Check if touch is still over the tile, if not, hide the panel
    if (hoveredTileBounds && e.changedTouches.length > 0) {
        const touch = e.changedTouches[0];
        const mapContainer = map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const touchLatLng = map.containerPointToLatLng(L.point(x, y));
        
        if (!hoveredTileBounds.contains(touchLatLng)) {
            // Touch ended outside tile and panel, hide after a short delay
            if (!hideTimeout) {
                hideTimeout = setTimeout(() => {
                    if (!isTouchOverPanel && !isTouchOverTile) {
                        hideHoverPanel();
                        hoveredTileBounds = null;
                        isHovering = false;
                    }
                    hideTimeout = null;
                }, 150);
            }
        }
    }
}, { passive: true });

hoverPanel.addEventListener('mouseleave', function () {
    map.scrollWheelZoom.enable(); // enables scroll zoom on the map
    isMouseOverPanel = false; // Mark that mouse has left the panel
    
    // Check if mouse is still over the tile, if not, hide the panel
    if (hoveredTileBounds && lastMouseLatLng) {
        if (!hoveredTileBounds.contains(lastMouseLatLng)) {
            // Mouse is neither over the tile nor the panel, hide after a short delay
            if (!hideTimeout) {
                hideTimeout = setTimeout(() => {
                    if (!isMouseOverPanel && (!hoveredTileBounds || !hoveredTileBounds.contains(lastMouseLatLng))) {
                        hideHoverPanel();
                        hoveredTileBounds = null;
                        isHovering = false;
                    }
                    hideTimeout = null;
                }, 150);
            }
        }
    }
});

// add event listener for the tile level modality checkbox
tileLevelModalityCheckbox.addEventListener('change', function () {
    if (tileLevelModalityCheckbox.checked) {
        tileLevelModalities.style.display = 'block';
    } else {
        tileLevelModalities.style.display = 'none';
    }
    preventHoverPanelSpill(); // Recalculate max height when content changes
});

// add event listener for the biomass values checkbox
biomassValuesCheckbox.addEventListener('change', function () {
	if (biomassValuesCheckbox.checked) {
		// If a pixel-level modality is selected, switch back to None
		if (selectedBackground !== 'solid') {
			document.getElementById('solid').checked = true;
			// Trigger the change event to update selectedBackground and legends
			document.getElementById('solid').dispatchEvent(new Event('change'));
		}
		
		biomassLegend.style.display = 'block';
		updateBiomassOverlays();
		// Refresh biomass tiles to make them transparent
		if (layers['biomass']) {
			showVisibleTiles('biomass', selectedBackground, true);
		}
		// Update control panel height if visible (to account for legend changes)
		if (controlPanel && controlPanel.classList.contains('visible')) {
			requestAnimationFrame(() => {
				preventControlPanelOverlap();
			});
		}
		// Update control panel height if visible (to account for legend changes)
		if (controlPanel && controlPanel.classList.contains('visible')) {
			requestAnimationFrame(() => {
				preventControlPanelOverlap();
			});
		}
	} else {
		biomassLegend.style.display = 'none';
		
		// Remove biomass image overlays
		if (layers['biomass'] && layers['biomass']['biomassImageOverlays']) {
			layers['biomass']['biomassImageOverlays'].forEach(overlay => {
				map.removeLayer(overlay);
			});
			layers['biomass']['biomassImageOverlays'] = [];
		}
		// Update control panel height if visible (to account for legend changes)
		if (controlPanel && controlPanel.classList.contains('visible')) {
			requestAnimationFrame(() => {
				preventControlPanelOverlap();
			});
		}
		// Refresh biomass tiles to restore solid color
		if (layers['biomass']) {
			showVisibleTiles('biomass', selectedBackground, true);
		}
	}
});

// Add event listeners for split changes
document.querySelectorAll('input[name="split"]').forEach(checkbox => {
	checkbox.addEventListener('change', function() {
		// Update all checked tasks when split selection changes
		for (const task of checkedTasks) {
			showVisibleTiles(task, selectedBackground, true); // force update
		}
	});
});

// Add event listener for train percentage dropdown
document.getElementById('train-select').addEventListener('change', function() {
	// Only update if train checkbox is checked
	if (document.getElementById('train').checked) {
		for (const task of checkedTasks) {
			showVisibleTiles(task, selectedBackground, true); // force update
		}
	}
});

// Add event listener for species dropdown
if (speciesSelect) {
	speciesSelect.addEventListener('change', function() {
		// Only update the species task if it's checked
		if (checkedTasks.includes('species') && layers['species']) {
			showVisibleTiles('species', selectedBackground, true); // force update
		}
	});
}

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
					// Don't update layers if user is hovering at zoom >= PIXEL_LEVEL_ZOOM_THRESHOLD
					if (!(isHovering && map.getZoom() >= PIXEL_LEVEL_ZOOM_THRESHOLD)) {
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

// Track previous zoom level to detect transitions
let previousZoom = map.getZoom();
let wasBackgroundReset = false;

// Use throttle for zoom events (less frequent, but still responsive)
const throttledZoomUpdate = throttle(() => {
	const zoom = map.getZoom();
	const crossedThreshold = (previousZoom < PIXEL_LEVEL_ZOOM_THRESHOLD && zoom >= PIXEL_LEVEL_ZOOM_THRESHOLD) || (previousZoom >= PIXEL_LEVEL_ZOOM_THRESHOLD && zoom < PIXEL_LEVEL_ZOOM_THRESHOLD);
	let forceUpdate = crossedThreshold;
	
	// Show/hide pixel-level modalities based on zoom level
	if (zoom >= PIXEL_LEVEL_ZOOM_THRESHOLD) {
		pixelLevelModalitiesContainer.style.display = 'block';
		zoomInstruction.style.display = 'none';
		
		// If we just zoomed back in and background was reset, force update
		if (wasBackgroundReset) {
			forceUpdate = true;
			wasBackgroundReset = false;
		}
		
		// Update hover panel position if hovering
		if (hoveredTileBounds) {
			moveHoverPanel();
		}
	} else {
		// Hide pixel-level modalities and hover panel below PIXEL_LEVEL_ZOOM_THRESHOLD
		pixelLevelModalitiesContainer.style.display = 'none';
		zoomInstruction.style.display = 'block';
		
		// Hide hover panel and reset state
		hideHoverPanel();
		hoveredTileBounds = null;
		isHovering = false;
		
		// Hide all modality legends when zooming out
		document.querySelectorAll('.legend').forEach(legend => {
			legend.style.display = 'none';
		});
		
		// Uncheck "Show biomass values" checkbox - this will trigger the change event
		// which hides the legend and removes overlays
		if (biomassValuesCheckbox.checked) {
			biomassValuesCheckbox.checked = false;
			biomassValuesCheckbox.dispatchEvent(new Event('change'));
		}
		
		// Reset to solid background if pixel-level modality was selected
		if (selectedBackground !== 'solid') {
			selectedBackground = 'solid';
			document.querySelector('input[name="pixel-level-modalities"][id="solid"]').checked = true;
			wasBackgroundReset = true;
		}
	}
	
	for (const task of checkedTasks) {
		showVisibleTiles(task, selectedBackground, forceUpdate);
	}
	// Update biomass overlays if showing biomass values
	updateBiomassOverlays();
	updateZoomLevel();
	
	previousZoom = zoom;
}, 150);

// Update during move using requestAnimationFrame for smoothness
map.on('move', rafUpdate);
map.on('moveend', rafUpdate);
map.on('zoomend', throttledZoomUpdate);
map.on('zoom', updateZoomLevel); // Update zoom level display during zoom animation

// Set initial zoom level display and pixel-level modalities visibility
updateZoomLevel();

// Initialize pixel-level modalities visibility based on current zoom
if (map.getZoom() >= PIXEL_LEVEL_ZOOM_THRESHOLD) {
	pixelLevelModalitiesContainer.style.display = 'block';
	zoomInstruction.style.display = 'none';
} else {
	pixelLevelModalitiesContainer.style.display = 'none';
	zoomInstruction.style.display = 'block';
}
