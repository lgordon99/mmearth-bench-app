export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1. The ROOT URL of your University server, the folder that contains "biomass", "soil_nitrogen", etc.
    const baseDataUrl = "https://sid.erda.dk/share_redirect/cbMhbwV1yP/mmearth-bench-explorer";

    // 2. Get the full path from the request
    //    If your map asks for: /biomass/png_tiles/Sentinel2/tile_10.png
    //    This variable becomes: /biomass/png_tiles/Sentinel2/tile_10.png
    const requestedPath = url.pathname;

    // 3. Combine them
    //    Result: https://university.edu/.../biomass/png_tiles/Sentinel2/tile_10.png
    const targetUrl = baseDataUrl + requestedPath;

    // 4. Fetch from University
    const response = await fetch(targetUrl);

    // 5. Check if the file actually exists (Optional debugging)
    if (response.status !== 200) {
        return new Response(`Error: Could not find file at ${targetUrl}`, { status: 404 });
    }

    // 6. Forward the file with CORS and Caching headers
    const newResponse = new Response(response.body, response);
    newResponse.headers.set("Access-Control-Allow-Origin", "*");
    newResponse.headers.set("Cache-Control", "public, max-age=604800"); // Cache for 1 week

    return newResponse;
  }
};