import { Injectable } from '@angular/core';
import { signal, computed } from '@angular/core';
import { MapboxStyle } from 'src/app/types';

/**
 * Service for managing Mapbox vector chart styles
 * Loads styles from Tileserver and caches them for global use
 *
 * TILESERVER VERSIONS SUPPORTED:
 * ================================
 *
 * 1. TileServer GL (Node.js/JavaScript)
 *    - Repository: github.com/maptiler/tileserver-gl
 *    - Active development, industry standard
 *    - Style API: /styles.json + /styles/{id}/style.json
 *    - Font Support: /fonts/{stack}/{range}.pbf
 *    - Sprite Support: /styles/{id}/sprite[@2x].{png,json}
 *
 * 2. TileServer RS (Rust Implementation)
 *    - Repository: github.com/vinayakkulkarni/tileserver-rs
 *    - 100% API-COMPATIBLE with tileserver-gl
 *    - Same endpoints as tileserver-gl (identical behavior)
 *    - Better performance (high-concurrency Rust)
 *    - Drop-in replacement for tileserver-gl
 *
 * 3. TileServer PHP (DEPRECATED - Legacy only)
 *    - Status: ARCHIVED (no longer maintained)
 *    - Does NOT support /styles.json endpoint
 *    - Does NOT support MapLibre GL Style JSON
 *    - Uses old TileJSON 2.0 format instead
 *    - NOT RECOMMENDED - do not use for new projects
 *
 * NOTE: No "tileserver-cl" or C/C++ variant exists. The rendering engine
 * (MapLibre Native) is C++, but it's only a library used by the servers.
 *
 * STANDARD ENDPOINTS (tileserver-gl / tileserver-rs):
 * ===================================================
 * GET /styles.json                           - Array of available styles
 * GET /styles/{id}/style.json                - MapLibre GL Style JSON
 * GET /styles/{id}/sprite[@2x].png           - Sprite image (1x or 2x)
 * GET /styles/{id}/sprite[@2x].json          - Sprite metadata
 * GET /styles/{id}/wmts.xml                  - WMTS OGC capabilities
 * GET /fonts.json                            - Available fonts list
 * GET /fonts/{fontstack}/{start}-{end}.pbf   - Font glyphs (PBF format)
 * GET /data.json                             - List of tile sources
 * GET /data/{source}.json                    - TileJSON for a source
 *
 * RESPONSE FORMAT for /styles.json (tileserver-gl & tileserver-rs):
 * =================================================================
 * [
 *   {
 *     "id": "basic",
 *     "name": "Basic Vector Style (Sample)",
 *     "url": "http://localhost:8081/styles/basic/style.json"
 *   },
 *   {
 *     "id": "nautical",
 *     "name": "Nautical Placeholder Style",
 *     "url": "http://localhost:8081/styles/nautical/style.json"
 *   }
 * ]
 *
 * Each style object contains:
 * - id: Unique identifier (used as key)
 * - name: Human-readable display name
 * - url: Direct URL to Mapbox Style JSON (MapLibre GL compatible)
 */
@Injectable({
  providedIn: 'root'
})
export class StylesService {
  private styles = signal<MapboxStyle[]>([]);
  private stylesLoaded = signal(false);
  private styleCache = new Map<string, MapboxStyle>();
  private spriteMetadataCache = new Map<string, Record<string, any>>();

  // Expose available styles as computed signal
  availableStyles = computed(() => this.styles());
  isLoaded = computed(() => this.stylesLoaded());

  /**
   * Load all available vector chart styles from Tileserver
   * Tries multiple endpoints and port combinations
   */
  async loadStyles(baseUrl?: string): Promise<MapboxStyle[]> {
    if (this.stylesLoaded()) {
      return this.styles();
    }

    const tileserverUrls = baseUrl 
      ? [baseUrl]
      : [
          'http://localhost:8080',
          'http://localhost:8081',
          'http://127.0.0.1:8080',
          'http://127.0.0.1:8081'
        ];

    for (const tileserverUrl of tileserverUrls) {
      try {
        // First, check if Tileserver is reachable
        const isReachable = await this.checkTileserverHealth(tileserverUrl);
        if (!isReachable) {
          continue;
        }

        const loadedStyles = await this.loadFromUrl(tileserverUrl);
        
        if (loadedStyles.length > 0) {
          this.styles.set(loadedStyles);
          this.stylesLoaded.set(true);
          console.log(`[StylesService] Successfully loaded ${loadedStyles.length} styles`);
          return loadedStyles;
        }
      } catch (error) {
        continue;
      }
    }

    console.warn('[StylesService] Could not load styles from any Tileserver URL');
    return [];
  }

  /**
   * Check if Tileserver is reachable and working
   * 
   * Uses /health endpoint (common to all tileserver implementations)
   * Tileserver-gl: Responds with "OK" text
   * Tileserver-rs: Responds with "OK" text
   * Tileserver-php: Does not have /health endpoint but /health might redirect
   *
   * @param tileserverUrl Base URL to check
   * @returns true if server responds successfully
   */
  private async checkTileserverHealth(tileserverUrl: string): Promise<boolean> {
    try {
      const response = await fetch(`${tileserverUrl}/health`, { method: 'GET' });
      return response.ok || response.status < 500;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load styles from a specific Tileserver URL
   *
   * ENDPOINT LOADING STRATEGY (in order):
   * ====================================
   *
   * 1. PRIMARY: GET /styles.json (tileserver-gl 3.0+ and tileserver-rs)
   *    ✓ STANDARD - Actively maintained, industry default
   *    - Response: [{ id, name, url }, ...]
   *    - Used by: tileserver-gl (Node.js), tileserver-rs (Rust)
   *    - Performance: Fast, single request for all styles
   *    - Example IDs: "basic", "nautical", "osm-bright"
   *
   * 2. FALLBACK: GET /data/styles.json (legacy alternative)
   *    ✗ DEPRECATED - Older implementations only
   *    - Response: Varies (may be plain JSON or different format)
   *    - Used rarely by: custom implementations
   *    - Attempted if /styles.json returns 404
   *
   * 3. FALLBACK: GET /styles (directory listing)
   *    ✗ UNRELIABLE - Returns HTML or plain text
   *    - Response: HTML directory listing or newline-separated IDs
   *    - Attempted if previous endpoints fail
   *    - Requires manual parsing (not standardized)
   *
   * 4. KNOWN STYLES FALLBACK: Direct fetch by ID
   *    - Attempts to load: ['basic', 'nautical', 'klokantech-basic', 'osm-bright']
   *    - URL: /styles/{id}/style.json
   *    - Last resort when listing endpoints are unavailable
   *    - Common style names from both tileserver-gl and tileserver-rs
   *
   * IMPORTANT NOTES:
   * ================
   * - tileserver-gl and tileserver-rs use IDENTICAL /styles.json format
   *   Both implementations are 100% compatible - no special handling needed
   *
   * - Each style object from /styles.json contains:
   *   {
   *     "id": "basic",                                          # Unique identifier
   *     "name": "Basic Vector Style (Sample)",                 # Display name
   *     "url": "http://localhost:8081/styles/basic/style.json" # MapLibre GL JSON
   *   }
   *
   * - The "url" field points to MapLibre GL compatible style.json
   *   This can be directly passed to ol-mapbox-style applyStyle()
   *
   * - Each style.json contains layers, sources, sprites, fonts, etc.
   *   All compatible with ol/mapbox-style library
   *
   * @param tileserverUrl Base URL of the Tileserver instance
   * @returns Promise resolving to array of loaded MapboxStyle objects
   */
  private async loadFromUrl(tileserverUrl: string): Promise<MapboxStyle[]> {
    const loadedStyles: MapboxStyle[] = [];

    // PRIMARY ENDPOINT: GET /styles.json (tileserver-gl 3.0+ and tileserver-rs)
    // This is the standard endpoint for listing all available styles
    // Used by both actively maintained Tileserver implementations
    try {
      const stylesJsonUrl = `${tileserverUrl}/styles.json`;
      const response = await fetch(stylesJsonUrl);

      if (response.ok) {
        const stylesList = await response.json() as Array<{ id: string; name: string; url: string }>;
        console.debug(`[StylesService] Found ${stylesList.length} styles via /styles.json`);

        // Load each style's full JSON definition
        for (const styleInfo of stylesList) {
          try {
            const styleUrl = styleInfo.url;
            const styleId = styleInfo.id; // Use ID as primary key (not name)
            const styleResponse = await fetch(styleUrl);

            if (styleResponse.ok) {
              const style = await styleResponse.json() as MapboxStyle;
              // Ensure style has both properties for UI and internal use
              style.name = style.name || styleInfo.name;
              style.id = styleId;
              
              // Also load sprite metadata if available
              if (style.sprite) {
                await this.loadSpriteMetadata(style);
              }
              
              loadedStyles.push(style);
              this.styleCache.set(styleId, style);
              console.debug(`[StylesService] Loaded: ${styleId}`);
            } else {
              console.debug(`[StylesService] Failed to fetch ${styleId}: HTTP ${styleResponse.status}`);
            }
          } catch (error) {
            console.debug(`[StylesService] Error loading style ${styleInfo.id}:`, error);
          }
        }

        if (loadedStyles.length > 0) {
          // Update signal so getStyleNames() and other accessors work
          this.styles.set(loadedStyles);
          return loadedStyles;
        }
      } else {
        console.debug(`[StylesService] /styles.json returned HTTP ${response.status}`);
      }
    } catch (error) {
      console.debug('[StylesService] /styles.json endpoint failed:', error);
    }

    // FALLBACK ENDPOINTS: For older or custom Tileserver implementations
    // These are attempted only if /styles.json fails
    const fallbackEndpoints = [
      { path: '/data/styles.json', format: 'json', description: 'legacy data endpoint' },
      { path: '/styles', format: 'list', description: 'directory listing' }
    ];

    for (const endpoint of fallbackEndpoints) {
      try {
        const url = `${tileserverUrl}${endpoint.path}`;
        const response = await fetch(url);

        if (response.ok) {
          const data = await response.json();
          console.debug(`[StylesService] Got response from ${endpoint.path}`);

          if (Array.isArray(data)) {
            for (const styleInfo of data) {
              const styleName = typeof styleInfo === 'string' ? styleInfo : styleInfo.name || styleInfo.id;
              const styleUrl = `${tileserverUrl}/styles/${styleName}/style.json`;

              try {
                const styleResponse = await fetch(styleUrl);
                if (styleResponse.ok) {
                  const style = await styleResponse.json() as MapboxStyle;
                  style.name = style.name || styleName;
                  loadedStyles.push(style);
                  this.styleCache.set(styleName, style);
                  console.debug(`[StylesService] Loaded via fallback: ${styleName}`);
                }
              } catch (error) {
                console.debug(`[StylesService] Failed to load style ${styleName}:`, error);
              }
            }
          }

          if (loadedStyles.length > 0) {
            // Update signal so getStyleNames() and other accessors work
            this.styles.set(loadedStyles);
            return loadedStyles;
          }
        }
      } catch (error) {
        console.debug(`[StylesService] Fallback endpoint ${endpoint.path} failed:`, error);
      }
    }

    // LAST RESORT: Try known style IDs directly
    // If all endpoints fail, attempt to load styles by trying common IDs
    // These are standard style names found in both tileserver-gl and tileserver-rs
    const knownStyles = ['basic', 'nautical', 'klokantech-basic', 'osm-bright'];
    console.debug('[StylesService] Trying known style IDs...');
    
    for (const styleName of knownStyles) {
      try {
        const styleUrl = `${tileserverUrl}/styles/${styleName}/style.json`;
        const styleResponse = await fetch(styleUrl);

        if (styleResponse.ok) {
          const style = await styleResponse.json() as MapboxStyle;
          style.name = style.name || styleName;
          loadedStyles.push(style);
          this.styleCache.set(styleName, style);
          console.debug(`[StylesService] Loaded known style: ${styleName}`);
        }
      } catch (error) {
        console.debug(`[StylesService] Known style ${styleName} not found:`, error);
      }
    }

    // Update signal with any styles found (even if empty array)
    this.styles.set(loadedStyles);
    return loadedStyles;
  }

  /**
   * Get a specific style object by its ID
   * Retrieves the full MapLibre GL Style JSON for a given ID
   *
   * @param styleId Style identifier (from stylesList.id)
   * @returns MapboxStyle object with layers, sources, etc., or undefined if not found
   */
  getStyle(styleId: string): MapboxStyle | undefined {
    // Try cache first (faster)
    if (this.styleCache.has(styleId)) {
      return this.styleCache.get(styleId);
    }

    // Fallback: search by name in loaded styles array
    return this.styles().find(s => s.name === styleId);
  }

  /**
   * Get list of display names for all loaded styles
   * Returns human-readable style names, not IDs
   *
   * @returns Array of style display names
   */
  getStyleNames(): string[] {
    return this.styles()
      .map(s => s.name || 'Unknown')
      .filter(name => name !== 'Unknown');
  }

  /**
   * Get list of style IDs (internal identifiers)
   * These are the stable identifiers from the Tileserver /styles.json endpoint
   *
   * @returns Array of style IDs (e.g., ["basic", "nautical"])
   */
  getStyleIds(): string[] {
    return Array.from(this.styleCache.keys());
  }

  /**
   * Get UI-ready style options with both ID and display name
   * Designed for use in form dropdowns and select menus
   *
   * USAGE:
   * ------
   * // In Settings Dialog:
   * const options = stylesService.getStyleOptions();
   * // [
   * //   { id: "basic", displayName: "Basic Vector Style (Sample)" },
   * //   { id: "nautical", displayName: "Nautical Placeholder Style" }
   * // ]
   *
   * // In the dropdown:
   * @for(style of options; track style.id) {
   *   <mat-option [value]="style.id">{{style.displayName}}</mat-option>
   * }
   *
   * @returns Array of objects with id and displayName properties
   */
  getStyleOptions(): Array<{ id: string; displayName: string }> {
    return this.styles().map(style => ({
      id: (style as any).id || style.name || 'unknown',
      displayName: style.name || 'Unknown Style'
    }));
  }

  /**
   * Clear cached styles (useful for refreshing)
   */
  clearCache(): void {
    this.styleCache.clear();
    this.styles.set([]);
    this.stylesLoaded.set(false);
  }

  /**
   * Load sprite metadata for a style
   * @param style MapboxStyle that has a sprite URL
   */
  private async loadSpriteMetadata(style: MapboxStyle): Promise<void> {
    if (!style.sprite) {
      return;
    }

    try {
      // Build sprite metadata URL (sprite.json)
      const spriteJsonUrl = style.sprite.endsWith('.json')
        ? style.sprite
        : style.sprite.endsWith('.png')
          ? style.sprite.replace(/\.png$/, '.json')
          : `${style.sprite}.json`;

      const response = await fetch(spriteJsonUrl);
      if (response.ok) {
        const spriteData = await response.json() as Record<string, any>;
        
        // Cache it
        this.spriteMetadataCache.set(spriteJsonUrl, spriteData);
        
        // Attach to style object for easy access
        (style as any).spriteMetadata = spriteData;
        console.debug(`[StylesService] Loaded sprite metadata for ${style.id}`);
      }
    } catch (error) {
      console.debug(`[StylesService] Failed to load sprite metadata:`, error);
    }
  }

  /**
   * Get sprite metadata for a style
   * @param styleId Style identifier
   * @returns Sprite metadata object or undefined
   */
  getSpriteMetadata(styleId: string): Record<string, any> | undefined {
    const style = this.getStyle(styleId);
    return (style as any)?.spriteMetadata;
  }

  /**
   * Extract icon name from a layer for display purposes
   * Follows the same logic as the map renderer
   * 
   * @param style Mapbox style
   * @param sourceLayerId Vector tile source layer ID (lowercase)
   * @returns Sprite icon name and metadata, or null if not found
   */
  extractLayerIcon(style: MapboxStyle | undefined, sourceLayerId: string): { iconName: string; coords: any } | null {
    if (!style?.layers) {
      return null;
    }

    const searchId = sourceLayerId.toLowerCase();

    // Find symbol layers that target this source-layer
    const symbolLayers = style.layers.filter(
      l => l.type === 'symbol' && (l as any)['source-layer']?.toLowerCase() === searchId
    );

    // Try each symbol layer to find a valid icon
    for (const symbolLayer of symbolLayers) {
      const layout = symbolLayer.layout as any;
      const iconImage = layout?.['icon-image'];
      
      if (!iconImage) continue;

      let iconName: string | null = null;

      // Extract icon name (handle static string or expression)
      if (typeof iconImage === 'string') {
        iconName = iconImage;
      } else if (Array.isArray(iconImage)) {
        iconName = this.extractIconNameFromExpression(iconImage);
      }

      if (iconName) {
        return { iconName, coords: null }; // Caller will look up coords in spriteMetadata
      }
    }

    return null;
  }

  /**
   * Get normalized sprite URL for a style
   * Converts .json to .png, adds .png extension if needed
   */
  getSpriteUrl(spriteBase?: string): string | undefined {
    if (!spriteBase) return undefined;
    if (spriteBase.endsWith('.png')) return spriteBase;
    if (spriteBase.endsWith('.json')) return spriteBase.replace(/\.json$/, '.png');
    return `${spriteBase}.png`;
  }

  /**
   * Extract fill and line styles for a layer
   * Returns fill color and line color from fill/line layers with matching source-layer
   */
  extractLayerStyles(style: MapboxStyle | undefined, sourceLayerId: string): { fillColor?: string; lineColor?: string; lineWidth?: number } {
    if (!style?.layers) {
      return {};
    }

    const searchId = sourceLayerId.toLowerCase();
    const result: { fillColor?: string; lineColor?: string; lineWidth?: number } = {};

    // Find fill layers that target this source-layer
    const fillLayers = style.layers.filter(
      l => l.type === 'fill' && (l as any)['source-layer']?.toLowerCase() === searchId
    );

    // Extract fill color from first fill layer
    if (fillLayers.length > 0) {
      const fillLayer = fillLayers[0];
      const paint = (fillLayer as any).paint;
      if (paint) {
        const fillColor = paint['fill-color'];
        if (typeof fillColor === 'string') {
          result.fillColor = fillColor;
        }
      }
    }

    // Find line layers that target this source-layer
    const lineLayers = style.layers.filter(
      l => l.type === 'line' && (l as any)['source-layer']?.toLowerCase() === searchId
    );

    // Extract line color and width from first line layer
    if (lineLayers.length > 0) {
      const lineLayer = lineLayers[0];
      const paint = (lineLayer as any).paint;
      if (paint) {
        const lineColor = paint['line-color'];
        if (typeof lineColor === 'string') {
          result.lineColor = lineColor;
        }
        const lineWidth = paint['line-width'];
        if (typeof lineWidth === 'number') {
          result.lineWidth = lineWidth;
        }
      }
    }

    return result;
  }

  /**
   * Extract icon name from Mapbox expression
   * Handles case expressions, match expressions, etc.
   */
  private extractIconNameFromExpression(expr: any): string | null {
    if (!Array.isArray(expr) || expr.length < 2) {
      return null;
    }

    const operator = expr[0];

    // Handle coalesce expressions: ["coalesce", ["get", "symbol_id"], "lights"]
    // Returns the fallback string (last literal string argument)
    if (operator === 'coalesce') {
      // Iterate backwards to find the first string literal
      for (let i = expr.length - 1; i >= 1; i--) {
        if (typeof expr[i] === 'string') {
          return expr[i];
        }
      }
      return null;
    }

    // Handle case expressions: ["case", condition, result, ...]
    // Or match expressions: ["match", value, case1, result1, ...]
    if (operator === 'case' || operator === 'match') {
      const startIdx = operator === 'case' ? 2 : 3;
      const step = 2;
      
      for (let i = startIdx; i < expr.length; i += step) {
        if (typeof expr[i] === 'string') {
          return expr[i];
        }
      }
      
      // Fallback value
      if (typeof expr[expr.length - 1] === 'string') {
        return expr[expr.length - 1];
      }
    }

    return null;
  }
}
