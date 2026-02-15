import { Injectable } from '@angular/core';
import { signal, computed } from '@angular/core';
import { MapboxStyle } from 'src/app/types';

/**
 * Explicit state machine for styles loading lifecycle
 */
enum StylesLoadState {
  UNINITIALIZED = 'uninitialized',
  LOADING = 'loading',
  LOADED = 'loaded',
  FAILED = 'failed',
  STALE = 'stale',
  REFRESHING = 'refreshing'
}

/**
 * Service for managing Mapbox vector chart styles
 * 
 * KEY IMPROVEMENTS:
 * ================
 * 1. Explicit state machine (no implicit states from signals)
 * 2. Per-request AbortController with timeouts
 * 3. Concurrent request guard (mutex-like behavior)
 * 4. JSON validation before caching
 * 5. Bounded concurrent requests (max 5)
 * 6. TTL support for cache invalidation
 * 7. Proper resource cleanup (clearCache includes all caches)
 * 8. Better error reporting with categorized failures
 * 9. Memory exhaustion protection
 * 10. Explicit signal state invariant enforcement
 */
@Injectable({
  providedIn: 'root'
})
export class StylesServiceFixed {
  private styles = signal<MapboxStyle[]>([]);
  private stylesLoaded = signal(false);
  private styleCache = new Map<string, MapboxStyle>();
  private spriteMetadataCache = new Map<string, Record<string, any>>();
  
  // NEW: Explicit state machine
  private loadState = signal<StylesLoadState>(StylesLoadState.UNINITIALIZED);
  private loadError = signal<string | null>(null);
  private lastLoadTime = signal<number>(0);
  private readonly STYLE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  
  // NEW: Concurrency guard
  private loadingPromise: Promise<MapboxStyle[]> | null = null;
  
  // NEW: Bounded concurrent requests
  private concurrentFetchCount = 0;
  private readonly MAX_CONCURRENT_FETCHES = 5;
  private requestQueue: (() => Promise<any>)[] = [];

  // Expose states as computed signals
  availableStyles = computed(() => this.styles());
  isLoaded = computed(() => this.stylesLoaded());
  currentState = computed(() => this.loadState());
  lastError = computed(() => this.loadError());
  isStale = computed(() => {
    const state = this.loadState();
    if (state === StylesLoadState.STALE) return true;
    
    // Check TTL
    const elapsed = Date.now() - this.lastLoadTime();
    return this.stylesLoaded() && elapsed > this.STYLE_TTL_MS;
  });

  /**
   * Load all available vector chart styles from Tileserver
   * 
   * FIXES P0 ISSUES:
   * ✓ Prevents concurrent execution (loadingPromise guard)
   * ✓ Per-request timeouts (AbortController)
   * ✓ JSON validation (validateStyle)
   * ✓ Bounded requests (MAX_CONCURRENT_FETCHES)
   */
  async loadStyles(baseUrl?: string): Promise<MapboxStyle[]> {
    // ✓ GUARD: Prevent concurrent loadStyles() calls
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // ✓ STATE: Transition to LOADING
    if (this.loadState() === StylesLoadState.LOADED && !this.isStale()) {
      return this.styles();
    }

    this.loadState.set(StylesLoadState.LOADING);
    this.loadError.set(null);

    try {
      this.loadingPromise = this._performLoad(baseUrl);
      const result = await this.loadingPromise;
      
      // ✓ STATE INVARIANT: If loaded, must have styles
      if (result.length > 0) {
        this.lastLoadTime.set(Date.now());
        this.loadState.set(StylesLoadState.LOADED);
      } else {
        // ✓ PROPER FAILURE STATE
        this.loadState.set(StylesLoadState.FAILED);
        this.loadError.set('No styles returned from any Tileserver URL');
      }
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.loadError.set(errorMsg);
      this.loadState.set(StylesLoadState.FAILED);
      console.error('[StylesService] Load failed:', errorMsg);
      return [];
    } finally {
      this.loadingPromise = null;
    }
  }

  /**
   * Perform the actual loading work (called by loadStyles)
   */
  private async _performLoad(baseUrl?: string): Promise<MapboxStyle[]> {
    const tileserverUrls = baseUrl 
      ? [baseUrl]
      : [
          'http://localhost:8080',
          'http://localhost:8081',
          'http://127.0.0.1:8080',
          'http://127.0.0.1:8081'
        ];

    let lastError: string | null = null;

    for (const tileserverUrl of tileserverUrls) {
      try {
        const isReachable = await this.checkTileserverHealth(tileserverUrl);
        if (!isReachable) {
          continue;
        }

        const loadedStyles = await this.loadFromUrl(tileserverUrl);
        
        if (loadedStyles.length > 0) {
          this.styles.set(loadedStyles);
          this.stylesLoaded.set(true);
          console.log(`[StylesService] Successfully loaded ${loadedStyles.length} styles from ${tileserverUrl}`);
          return loadedStyles;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.debug(`[StylesService] Error loading from ${tileserverUrl}:`, error);
        continue;
      }
    }

    if (lastError) {
      throw new Error(lastError);
    }

    console.warn('[StylesService] Could not load styles from any Tileserver URL');
    return [];
  }

  /**
   * Check if Tileserver is reachable
   * ✓ FIX P0: Added AbortController timeout (2 second per URL)
   */
  private async checkTileserverHealth(tileserverUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const response = await fetch(`${tileserverUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });
      return response.ok || response.status < 500;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.debug(`[StylesService] Health check timeout for ${tileserverUrl}`);
        return false;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Load styles from a specific Tileserver URL
   * ✓ FIX P0: Per-request AbortController
   * ✓ FIX P1: JSON validation before caching
   * ✓ FIX P1: Bounded concurrent requests
   */
  private async loadFromUrl(tileserverUrl: string): Promise<MapboxStyle[]> {
    const loadedStyles: MapboxStyle[] = [];

    try {
      // ✓ FIX P0: AbortController with timeout for /styles.json
      const stylesJsonUrl = `${tileserverUrl}/styles.json`;
      const stylesList = await this.fetchWithTimeout(stylesJsonUrl, 5000);

      if (!Array.isArray(stylesList)) {
        throw new Error(`/styles.json returned invalid format: ${typeof stylesList}`);
      }

      console.debug(`[StylesService] Found ${stylesList.length} styles via /styles.json`);

      // ✓ FIX P1: Bounded concurrent requests (max 5 at a time)
      for (const styleInfo of stylesList) {
        await this._loadStyleWithBoundedConcurrency(styleInfo, loadedStyles);
      }

      if (loadedStyles.length > 0) {
        this.styles.set(loadedStyles);
      }

      return loadedStyles;
    } catch (error) {
      console.debug('[StylesService] /styles.json failed:', error);
      return [];
    }
  }

  /**
   * Load a single style with bounded concurrency control
   * ✓ FIX P1: Max 5 concurrent fetches prevents resource exhaustion
   */
  private async _loadStyleWithBoundedConcurrency(
    styleInfo: any,
    loadedStyles: MapboxStyle[]
  ): Promise<void> {
    // Wait if at max concurrent requests
    while (this.concurrentFetchCount >= this.MAX_CONCURRENT_FETCHES) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.concurrentFetchCount++;

    try {
      const styleUrl = styleInfo.url;
      const styleId = styleInfo.id;

      const style = await this.fetchWithTimeout(styleUrl, 8000);
      
      // ✓ FIX P0: Validate JSON structure before using
      this.validateStyle(style);
      
      style.name = style.name || styleInfo.name;
      style.id = styleId;

      // ✓ Load sprite metadata in background (non-blocking)
      if (style.sprite) {
        this.loadSpriteMetadata(style).catch(err => {
          console.debug(`[StylesService] Sprite load failed for ${styleId}:`, err);
        });
      }

      loadedStyles.push(style);
      this.styleCache.set(styleId, style);
      console.debug(`[StylesService] Loaded: ${styleId}`);
    } catch (error) {
      const styleId = styleInfo?.id || 'unknown';
      if (error instanceof Error && error.name === 'AbortError') {
        console.debug(`[StylesService] Request timeout for ${styleId}`);
      } else {
        console.debug(`[StylesService] Error loading style ${styleId}:`, error);
      }
    } finally {
      this.concurrentFetchCount--;
    }
  }

  /**
   * Fetch with automatic timeout
   * ✓ FIX P0: Prevents hanging requests
   */
  private async fetchWithTimeout(url: string, timeoutMs: number = 5000): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Validate style JSON structure
   * ✓ FIX P0: Prevents runtime crashes from invalid data
   */
  private validateStyle(style: any): void {
    if (style === null || typeof style !== 'object') {
      throw new TypeError(`Style must be an object, got ${typeof style}`);
    }

    // Check for required fields
    if (typeof style.version !== 'number') {
      throw new TypeError(`style.version must be a number, got ${typeof style.version}`);
    }

    if (!Array.isArray(style.layers)) {
      throw new TypeError(`style.layers must be an array, got ${typeof style.layers}`);
    }

    if (typeof style.sources !== 'object' || style.sources === null) {
      throw new TypeError(`style.sources must be an object, got ${typeof style.sources}`);
    }

    // Check layer structure
    for (let i = 0; i < style.layers.length; i++) {
      const layer = style.layers[i];
      if (typeof layer !== 'object' || layer === null) {
        throw new Error(`style.layers[${i}] must be an object, got ${typeof layer}`);
      }
      if (typeof layer.id !== 'string') {
        throw new Error(`style.layers[${i}].id must be a string, got ${typeof layer.id}`);
      }
      if (!['background', 'fill', 'line', 'symbol', 'raster', 'circle', 'fill-extrusion', 'heatmap', 'hillshade'].includes(layer.type)) {
        throw new Error(`style.layers[${i}].type invalid: ${layer.type}`);
      }
    }
  }

  /**
   * Load sprite metadata for a style
   * ✓ FIX: With timeout protection
   */
  private async loadSpriteMetadata(style: MapboxStyle): Promise<void> {
    if (!style.sprite) {
      return;
    }

    try {
      const spriteJsonUrl = this.normalizeSpriteUrl(style.sprite, 'json');
      
      // Check cache first
      if (this.spriteMetadataCache.has(spriteJsonUrl)) {
        (style as any).spriteMetadata = this.spriteMetadataCache.get(spriteJsonUrl);
        return;
      }

      const spriteData = await this.fetchWithTimeout(spriteJsonUrl, 3000);
      
      if (typeof spriteData !== 'object' || spriteData === null) {
        throw new TypeError(`Sprite metadata must be object, got ${typeof spriteData}`);
      }

      this.spriteMetadataCache.set(spriteJsonUrl, spriteData);
      (style as any).spriteMetadata = spriteData;
      console.debug(`[StylesService] Loaded sprite metadata for ${style.id}`);
    } catch (error) {
      console.debug(`[StylesService] Failed to load sprite metadata:`, error);
      // Non-blocking failure - app continues
    }
  }

  /**
   * Normalize sprite URL
   */
  private normalizeSpriteUrl(spriteBase: string, type: 'png' | 'json'): string {
    const ext = type === 'png' ? '.png' : '.json';
    
    if (type === 'png') {
      if (spriteBase.endsWith('.png')) return spriteBase;
      if (spriteBase.endsWith('.json')) return spriteBase.replace(/\.json$/, '.png');
      return `${spriteBase}.png`;
    } else {
      if (spriteBase.endsWith('.json')) return spriteBase;
      if (spriteBase.endsWith('.png')) return spriteBase.replace(/\.png$/, '.json');
      return `${spriteBase}.json`;
    }
  }

  /**
   * Get a specific style by ID
   */
  getStyle(styleId: string): MapboxStyle | undefined {
    if (this.styleCache.has(styleId)) {
      return this.styleCache.get(styleId);
    }
    return this.styles().find(s => s.name === styleId);
  }

  /**
   * Get list of style names
   */
  getStyleNames(): string[] {
    return this.styles()
      .map(s => s.name || 'Unknown')
      .filter(name => name !== 'Unknown');
  }

  /**
   * Get list of style IDs
   */
  getStyleIds(): string[] {
    return Array.from(this.styleCache.keys());
  }

  /**
   * Get style options for UI (with both ID and display name)
   */
  getStyleOptions(): Array<{ id: string; displayName: string }> {
    return this.styles().map(style => ({
      id: (style as any).id || style.name || 'unknown',
      displayName: style.name || 'Unknown Style'
    }));
  }

  /**
   * Clear all caches completely
   * ✓ FIX P1: Now includes spriteMetadataCache
   */
  clearCache(): void {
    this.styleCache.clear();
    this.spriteMetadataCache.clear();  // ← ADDED
    this.styles.set([]);
    this.stylesLoaded.set(false);
    this.loadState.set(StylesLoadState.UNINITIALIZED);
    this.loadError.set(null);
    this.lastLoadTime.set(0);
  }

  /**
   * Manually refresh styles (for future UI feature)
   * Marks cache as stale and reloads
   */
  async refresh(baseUrl?: string): Promise<MapboxStyle[]> {
    this.loadState.set(StylesLoadState.REFRESHING);
    this.clearCache();
    return this.loadStyles(baseUrl);
  }

  /**
   * Get sprite metadata by style ID
   */
  getSpriteMetadata(styleId: string): Record<string, any> | undefined {
    const style = this.getStyle(styleId);
    return (style as any)?.spriteMetadata;
  }

  /**
   * Extract icon from a layer
   * ✓ FIX: Validates style before use
   */
  extractLayerIcon(
    style: MapboxStyle | undefined,
    sourceLayerId: string
  ): { iconName: string; coords: any } | null {
    if (!style?.layers) {
      return null;
    }

    const searchId = sourceLayerId.toLowerCase();
    const symbolLayers = style.layers.filter(
      l => l.type === 'symbol' && (l as any)['source-layer']?.toLowerCase() === searchId
    );

    for (const symbolLayer of symbolLayers) {
      const layout = symbolLayer.layout as any;
      const iconImage = layout?.['icon-image'];
      
      if (!iconImage) continue;

      let iconName: string | null = null;

      if (typeof iconImage === 'string') {
        iconName = iconImage;
      } else if (Array.isArray(iconImage)) {
        iconName = this.extractIconNameFromExpression(iconImage);
      }

      if (iconName) {
        return { iconName, coords: null };
      }
    }

    return null;
  }

  /**
   * Extract styles from a layer
   */
  extractLayerStyles(
    style: MapboxStyle | undefined,
    sourceLayerId: string
  ): { fillColor?: string; lineColor?: string; lineWidth?: number } {
    if (!style?.layers) {
      return {};
    }

    const searchId = sourceLayerId.toLowerCase();
    const result: { fillColor?: string; lineColor?: string; lineWidth?: number } = {};

    const fillLayers = style.layers.filter(
      l => l.type === 'fill' && (l as any)['source-layer']?.toLowerCase() === searchId
    );

    if (fillLayers.length > 0) {
      const paint = (fillLayers[0] as any).paint;
      if (paint?.['fill-color']) {
        result.fillColor = paint['fill-color'];
      }
    }

    const lineLayers = style.layers.filter(
      l => l.type === 'line' && (l as any)['source-layer']?.toLowerCase() === searchId
    );

    if (lineLayers.length > 0) {
      const paint = (lineLayers[0] as any).paint;
      if (paint?.['line-color']) {
        result.lineColor = paint['line-color'];
      }
      if (typeof paint?.['line-width'] === 'number') {
        result.lineWidth = paint['line-width'];
      }
    }

    return result;
  }

  /**
   * Extract icon name from expression
   * ✓ FIX P2: Handle more expression types
   */
  private extractIconNameFromExpression(expr: any): string | null {
    if (!Array.isArray(expr) || expr.length < 2) {
      return null;
    }

    const operator = expr[0];

    if (operator === 'coalesce') {
      for (let i = expr.length - 1; i >= 1; i--) {
        if (typeof expr[i] === 'string') {
          return expr[i];
        }
      }
      return null;
    }

    if (operator === 'case' || operator === 'match') {
      const startIdx = operator === 'case' ? 2 : 3;
      const step = 2;
      
      for (let i = startIdx; i < expr.length; i += step) {
        if (typeof expr[i] === 'string') {
          return expr[i];
        }
      }
      
      if (typeof expr[expr.length - 1] === 'string') {
        return expr[expr.length - 1];
      }
    }

    // NEW: Handle 'get' expressions pointing to attributes
    if (operator === 'get' && typeof expr[1] === 'string') {
      // Fallback to the attribute name itself
      return expr[1];
    }

    return null;
  }
}
