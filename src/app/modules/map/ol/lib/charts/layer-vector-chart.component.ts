import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  OnDestroy
} from '@angular/core';

import VectorTileLayer from 'ol/layer/VectorTile';
import VectorTileSource from 'ol/source/VectorTile';
import { MVT } from 'ol/format';
import { applyStyle } from 'ol-mapbox-style';

import { MapComponent } from '../map.component';
import { AppFacade } from 'src/app/app.facade';
import { StylesService } from 'src/app/lib/services/styles.service';

import { FBChart, MapboxStyle } from 'src/app/types';
import { initPMTilesVectorLayer } from './pmtiles-utils';
import { resolveLayerMaxZoom } from './zoom-utils';

// ** Freeboard Vector TileLayer Chart **
@Component({
  selector: 'ol-map > fb-tilelayer-vector',
  template: '<ng-content></ng-content>',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class VectorChartLayerComponent implements OnDestroy {
  protected chart = input<FBChart>();
  protected zIndex = input<number>();
  protected overZoomTiles = input<boolean>(true);
  protected mapMaxZoom = input<number>();

  private layer: VectorTileLayer;
  private changeDetectorRef = inject(ChangeDetectorRef);
  private mapComponent = inject(MapComponent);
  private app = inject(AppFacade);
  private stylesService = inject(StylesService);
  private visibleLayersKey: string | null = null;
  private currentChartUrl: string | null = null;
  private appliedStyleId: string | null = null; // Track which style is applied to prevent reapplication

  // Create a computed value that tracks layer visibility changes explicitly
  private visibilityKey = computed(() => {
    const chart = this.chart();
    if (!chart?.[1]?.layers || !chart[1].layerVisibility) {
      return '';
    }
    // Create a key from sorted visibility states to detect any changes
    return chart[1].layers
      .map((layerId) => `${layerId}:${chart[1].layerVisibility?.[layerId] === false ? 'hidden' : 'visible'}`)
      .sort()
      .join('|');
  });

  constructor() {
    this.changeDetectorRef.detach();
    
    // Main effect that handles chart changes and layer creation/destruction
    effect(() => {
      this.chart();
      this.zIndex();
      this.overZoomTiles();
      this.mapMaxZoom();
      // Also track visibility changes to trigger rebuilds
      this.visibilityKey();
      this.parseChart();
    });

    // Apply global style when it changes
    effect(() => {
      const styleId = this.app.vectorChartStyle();
      if (styleId && this.layer) {
        this.applyGlobalStyle(styleId);
      }
    });
  }

  ngOnDestroy() {
    const map = this.mapComponent.getMap();
    if (this.layer) {
      map.removeLayer(this.layer);
      map.render();
    }
    this.appliedStyleId = null;
    this.layer = undefined;
  }

  private parseChart(chart: FBChart = this.chart()) {
    const map = this.mapComponent.getMap();
    if (!map) {
      return;
    }

    const desiredVisibleLayers = this.getVisibleLayers(chart);
    const desiredLayersKey = this.toLayersKey(desiredVisibleLayers);
    const chartUrl = chart?.[1]?.url ?? null;

    if (this.layer) {
      const needsRebuild =
        this.visibleLayersKey !== desiredLayersKey ||
        this.currentChartUrl !== chartUrl;

      if (needsRebuild) {
        map.removeLayer(this.layer);
        this.layer = undefined;
        this.visibleLayersKey = null;
        this.currentChartUrl = null;
        this.appliedStyleId = null; // Reset applied style when layer is rebuilt
      }
    }

    if (!this.layer) {
      const minZ =
        chart[1].minZoom && chart[1].minZoom >= 0.1
          ? chart[1].minZoom - 0.1
          : chart[1].minZoom;
      const maxZ = chart[1].maxZoom;
      const layerMaxZ = resolveLayerMaxZoom(
        maxZ,
        this.mapMaxZoom(),
        this.overZoomTiles()
      );

      if (chart[1].url.indexOf('.pmtiles') !== -1) {
        this.layer = initPMTilesVectorLayer(chart[1], this.zIndex());
        
        // If initPMTilesVectorLayer returns null (no visible layers), exit early
        if (!this.layer) {
          return;
        }
      } else {
        // Only skip layer creation if layers are defined but ALL are hidden
        if (desiredVisibleLayers !== null && desiredVisibleLayers.length === 0) {
          return;
        }

        this.layer = new VectorTileLayer({
          source: new VectorTileSource({
            url: chart[1].url,
            format: new MVT({
              layers: desiredVisibleLayers  // null = all layers, array = filtered layers
            }),
            maxZoom: maxZ
          }),
          preload: 0,
          zIndex: this.zIndex(),
          minZoom: minZ,
          maxZoom: layerMaxZ,
          opacity: chart[1].defaultOpacity ?? 1
        });
      }

      if (this.layer) {
        this.layer.setMinZoom(minZ);
        this.layer.setMaxZoom(layerMaxZ);
        this.visibleLayersKey = desiredLayersKey;
        this.currentChartUrl = chartUrl;
        
        // Determine which style to apply first
        const globalStyleId = this.app.vectorChartStyle();
        
        // Only apply chart-level style if no global style is configured
        if (!globalStyleId && chart[1].style) {
          try {
            applyStyle(this.layer as any, chart[1].style);
          } catch (error) {
            console.warn('Failed to apply chart style:', error);
          }
        }
        
        // Apply global style if configured (takes precedence)
        if (globalStyleId) {
          this.applyGlobalStyle(globalStyleId);
        }
        
        this.layer.set('id', chart[0]);
        this.layer.set('chartId', chart[0]);
        this.layer.set('chartType', chart[1].type);
        this.layer.set('chartFormat', chart[1].format);
        map.addLayer(this.layer);
      }
    } else {
      const minZ =
        chart[1].minZoom && chart[1].minZoom >= 0.1
          ? chart[1].minZoom - 0.1
          : chart[1].minZoom;
      const maxZ = chart[1].maxZoom;
      const layerMaxZ = resolveLayerMaxZoom(
        maxZ,
        this.mapMaxZoom(),
        this.overZoomTiles()
      );
      this.layer.setZIndex(this.zIndex());
      this.layer.setMinZoom(minZ);
      this.layer.setMaxZoom(layerMaxZ);
      this.layer.setOpacity(chart[1].defaultOpacity ?? 1);
    }
    map.render();
  }

  /**
   * Apply global Mapbox style to the vector tile layer
   */
  private applyGlobalStyle(styleId: string) {
    if (!this.layer || this.appliedStyleId === styleId) {
      return; // Skip if already applied
    }

    const style = this.stylesService.getStyle(styleId);
    if (style) {
      const chartStyle = this.buildStyleForChart(style, this.chart());
      const sourceId = this.getPrimarySourceId(chartStyle);
      
      try {
        applyStyle(this.layer as any, chartStyle, sourceId);
        this.appliedStyleId = styleId;
      } catch (error) {
        console.warn(`Failed to apply style ${styleId}:`, error);
      }
      
      const map = this.mapComponent.getMap();
      if (map) {
        map.render();
      }
    }
    // Silently skip if style not found - it may load later
  }

  private buildStyleForChart(style: MapboxStyle, chart: FBChart): MapboxStyle {
    const chartUrl = chart?.[1]?.url;
    if (!chartUrl || !style.sources) {
      return style;
    }

    const remappedSources: MapboxStyle['sources'] = {};
    let hasVectorSource = false;

    for (const [sourceId, source] of Object.entries(style.sources)) {
      if (source?.type === 'vector') {
        hasVectorSource = true;
        const remappedSource: { [key: string]: unknown } = {
          ...source,
          tiles: [chartUrl]
        };
        delete (remappedSource as { url?: string }).url;
        remappedSources[sourceId] = remappedSource as MapboxStyle['sources'][string];
      } else {
        remappedSources[sourceId] = source;
      }
    }

    if (!hasVectorSource) {
      return style;
    }

    return {
      ...style,
      sources: remappedSources
    };
  }

  private getPrimarySourceId(style: MapboxStyle): string | undefined {
    if (!style.sources) {
      return undefined;
    }

    const entries = Object.entries(style.sources);
    const vectorSource = entries.find(([, source]) => source?.type === 'vector');
    if (vectorSource) {
      return vectorSource[0];
    }

    return entries.length > 0 ? entries[0][0] : undefined;
  }

  private getVisibleLayers(chart: FBChart): string[] | null {
    if (Array.isArray(chart?.[1]?.layers) && chart[1].layers.length > 0) {
      return chart[1].layers.filter(
        (layerId) => chart[1].layerVisibility?.[layerId] !== false
      );
    }
    return null;
  }

  private toLayersKey(layers: string[] | null): string | null {
    if (!Array.isArray(layers)) {
      return null;
    }
    return layers.join('|');
  }

}
