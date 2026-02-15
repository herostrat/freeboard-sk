import { Component, Inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MatDialog,
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA
} from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatInputModule } from '@angular/material/input';
import { AppFacade } from 'src/app/app.facade';
import { StylesService } from 'src/app/lib/services/styles.service';
import { MapboxStyle } from 'src/app/types';
import { SKChart } from 'src/app/modules/skresources/resource-classes';
import { CoordsPipe } from 'src/app/lib/pipes';
import {
  fetchCapabilitiesXml,
  getWMTSLayers,
  LayerNode,
  parseWMSCapabilities,
  WMSGetCapabilities,
  WMTSGetCapabilities
} from './wmslib';
import { NodeTreeSelect } from './node-tree-select';
import { NodeListSelect } from './node-list-select';
import { ChartProvider } from 'src/app/types';
import {
  LayerPropertiesDialog,
  LayerInfo
} from './layer-properties-dialog';
import { SKResourceService } from '../../resources.service';

/********* ChartPropertiesDialog **********
	data: <SKChart>
***********************************/
@Component({
  selector: 'ap-chartproperties',
  imports: [
    FormsModule,
    MatTooltipModule,
    MatIconModule,
    MatCardModule,
    MatButtonModule,
    MatToolbarModule,
    MatDialogModule,
    MatProgressBarModule,
    MatInputModule,
    CoordsPipe,
    NodeTreeSelect,
    NodeListSelect
  ],
  template: `
    <div class="_ap-chartinfo">
      <mat-toolbar style="background-color: transparent">
        <span class="dialog-icon"
          ><mat-icon>{{ isLocal(data['url']) }}</mat-icon></span
        >
        <span style="flex: 1 1 auto; text-align: center">Chart Properties</span>
        <span style="text-align: right">
          <button mat-icon-button (click)="handleClose(false)">
            <mat-icon>close</mat-icon>
          </button>
        </span>
      </mat-toolbar>
      <mat-dialog-content>
        <div style="display:flex;flex-direction: column;">
          <div style="display:flex;">
            <div class="key-label">Name:</div>
            <div style="flex: 1 1 auto;">
              <mat-form-field floatLabel="always" style="width:100%">
                <mat-label>Name</mat-label>
                <input
                  matInput
                  #inpname="ngModel"
                  type="text"
                  required
                  [readonly]="!isEditable()"
                  [(ngModel)]="data.name"
                />
                @if (inpname.invalid && (inpname.dirty || inpname.touched)) {
                  <mat-error> Please enter a name.</mat-error>
                }
              </mat-form-field>
            </div>
          </div>
          <div style="display:flex;">
            <div class="key-label">Description:</div>
            <div style="flex: 1 1 auto;">
              <mat-form-field floatLabel="always" style="width:100%">
                <mat-label>Description</mat-label>
                <input
                  matInput
                  #inpdesc="ngModel"
                  type="text"
                  [readonly]="!isEditable()"
                  [(ngModel)]="data.description"
                />
              </mat-form-field>
            </div>
          </div>
          <div style="display:flex;">
            <div class="key-label">Scale:</div>
            <div style="flex: 1 1 auto;">{{ data.scale }}</div>
          </div>
          @if (data.defaultOpacity) {
            <div style="display:flex;">
              <div class="key-label">Opacity:</div>
              <div style="flex: 1 1 auto;">{{ data.defaultOpacity }}</div>
            </div>
          }
          <div style="display:flex;">
            <div class="key-label">Zoom:</div>
            <div style="flex: 1 1 auto;">
              <div style="flex: 1 1 auto;">
                <u><i>Min: </i></u>
                {{ data.minZoom }},
                <u><i>Max: </i></u>
                {{ data.maxZoom }}
              </div>
            </div>
          </div>
          @if (data.bounds) {
            <div style="display:flex;">
              <div class="key-label">Bounds:</div>
              <div
                style="flex: 1 1 auto; border: gray 1px solid;
                                  max-width: 220px;font-size: 10pt;"
              >
                <div style="text-align:right;">
                  <span
                    style="flex: 1 1 auto;"
                    [innerText]="data.bounds[3] | coords: 'HDd' : true"
                  >
                  </span
                  ><br />
                  <span
                    style="flex: 1 1 auto;"
                    [innerText]="data.bounds[2] | coords: 'HDd'"
                  >
                  </span>
                </div>
                <div>
                  <span
                    style="flex: 1 1 auto;"
                    [innerText]="data.bounds[1] | coords: 'HDd' : true"
                  >
                  </span
                  ><br />
                  <span
                    style="flex: 1 1 auto;"
                    [innerText]="data.bounds[0] | coords: 'HDd'"
                  >
                  </span>
                </div>
              </div>
            </div>
          }
          <div style="display:flex;">
            <div class="key-label">Format:</div>
            <div style="flex: 1 1 auto;">{{ data.format }}</div>
          </div>
          <div style="display:flex;">
            <div class="key-label">Type:</div>
            <div style="flex: 1 1 auto;">
              {{ data.type }}
            </div>
          </div>
          <div style="display:flex;">
            <div class="key-label">URL:</div>
            <div style="flex: 1 1 auto;overflow-x: auto;">
              {{ displayUrl(data.url) }}
            </div>
          </div>
          @if (styleDisplay()) {
            <div style="display:flex;">
              <div class="key-label">Style:</div>
              <div style="flex: 1 1 auto;overflow-x: auto;">
                {{ styleDisplay() }}
              </div>
            </div>
          }
          @if (data.source) {
            <div style="display:flex;">
              <div class="key-label">Source:</div>
              <div style="flex: 1 1 auto;overflow-x: auto;">
                {{ data.source }}
              </div>
            </div>
          }
          @if (
            isEditable() && ['wms', 'wmts'].includes(data.type.toLowerCase())
          ) {
            <div style="">
              <div class="key-label">Layers:</div>
              <div style="flex: 1 1 auto;">
                @if (!capabilitiesLoaded()) {
                  <button
                    mat-button
                    [disabled]="isFetching()"
                    (click)="loadCapabilities()"
                  >
                    Load layers
                  </button>
                  @if (capabilitiesError()) {
                    <div style="color: darkorange; font-size: 10pt;">
                      {{ capabilitiesError() }}
                    </div>
                  }
                }
                @if (isFetching()) {
                  <mat-progress-bar mode="query"></mat-progress-bar>
                } @else if (capabilitiesLoaded()) {
                  @if (data.type.toLowerCase() === 'wms') {
                    <node-tree-select
                      [layers]="wmsLayers"
                      [preSelect]="data.layers"
                      [expand]="true"
                      (selected)="handleLayerSelection($event)"
                    >
                    </node-tree-select>
                  } @else if (data.type.toLowerCase() === 'wmts') {
                    <node-list-select
                      [layers]="wmtsLayers"
                      [preSelect]="data.layers"
                      (selected)="handleLayerSelection($event)"
                    >
                    </node-list-select>
                  }
                  @if (
                    data.type.toLowerCase() === 'wms' &&
                    wmsLayers.length === 0
                  ) {
                    <div style="font-size: 10pt;">No layers available.</div>
                  }
                  @if (
                    data.type.toLowerCase() === 'wmts' &&
                    wmtsLayers.length === 0
                  ) {
                    <div style="font-size: 10pt;">No layers available.</div>
                  }
                }
              </div>
            </div>
          } @else if (data.layers.length) {
            <div style="display:flex;">
              <div class="key-label">Layers:</div>
              <div style="flex: 1 1 auto;">
                <button
                  mat-button
                  (click)="openLayerProperties()"
                >
                  <mat-icon>layers</mat-icon>
                  {{ data.layers.length }} {{ data.layers.length === 1 ? 'Layer' : 'Layers' }}
                </button>
              </div>
            </div>
          }
        </div>
      </mat-dialog-content>
      @if (isEditable()) {
        <mat-dialog-actions>
          <div style="text-align:center;width:100%;">
            <button
              mat-raised-button
              [disabled]="
                inpname.invalid ||
                (['wms', 'wmts'].includes(data.type.toLowerCase()) &&
                  data.layers.length === 0)
              "
              (click)="handleClose(true)"
            >
              SAVE
            </button>
          </div>
        </mat-dialog-actions>
      }
    </div>
  `,
  styles: [
    `
      ._ap-chartinfo {
        font-family: arial;
        min-width: 300px;
      }
      .ap-confirm-icon {
        min-width: 35px;
        max-width: 35px;
        color: darkorange;
        text-align: left;
      }

      ._ap-chartinfo .key-label {
        width: 150px;
        font-weight: 500;
      }

      @media only screen and (min-device-width: 768px) and (max-device-width: 1024px),
        only screen and (min-width: 800px) {
        .ap-confirm-icon {
          min-width: 25%;
          max-width: 25%;
        }
      }
    `
  ]
})
export class ChartPropertiesDialog {
  private static wmsLayerCache = new Map<string, LayerNode[]>();
  private static wmtsLayerCache = new Map<
    string,
    Array<{ id: string | number; name: string; description: string }>
  >();

  private readonly maxWmsNodes = 5000;
  private readonly maxWmsDepth = 12;
  private readonly maxWmtsLayers = 2000;

  protected icon: string;
  protected wmsLayers: LayerNode[] = [];
  protected wmtsLayers: Array<{
    id: string | number;
    name: string;
    description: string;
  }> = [];
  protected isEditable = signal<boolean>(false);
  protected isFetching = signal<boolean>(false);
  protected capabilitiesLoaded = signal<boolean>(false);
  protected capabilitiesError = signal<string | null>(null);

  constructor(
    public app: AppFacade,
    private dialog: MatDialog,
    private skres: SKResourceService,
    private stylesService: StylesService,
    public dialogRef: MatDialogRef<ChartPropertiesDialog>,
    @Inject(MAT_DIALOG_DATA) public data: SKChart
  ) {
    if (data.source?.toLowerCase() === 'resources-provider') {
      this.isEditable.set(true);
    }
  }

  isLocal(url: string) {
    return url && url.indexOf('signalk') !== -1 ? 'map' : 'language';
  }

  displayUrl(url?: string): string {
    if (!url) {
      return '';
    }
    return url.replace(/%7B/g, '{').replace(/%7D/g, '}');
  }

  private getGlobalStyle(): MapboxStyle | undefined {
    const styleId = this.app.vectorChartStyle();
    if (!styleId) {
      return undefined;
    }
    
    const style = this.stylesService.getStyle(styleId);
    if (!style) {
      console.warn(`Style not found: ${styleId}`);
    }
    return style;
  }

  styleDisplay(): string | null {
    if (this.data.style) {
      return this.data.style;
    }

    const styleId = this.app.vectorChartStyle();
    if (!styleId) {
      return null;
    }

    const style = this.getGlobalStyle();
    const label = style?.name || styleId;
    return `Global: ${label}`;
  }

  protected async openLayerProperties() {
    // Validate layers array
    if (!Array.isArray(this.data.layers) || this.data.layers.length === 0) {
      return;
    }

    // Initialize layerVisibility if undefined
    if (!this.data.layerVisibility) {
      this.data.layerVisibility = {};
    }

    // Get the global style that's currently being rendered on the map
    const globalStyle = this.getGlobalStyle();
    if (!globalStyle) {
      return this.openLayerPropertiesDialog([], undefined);
    }

    // Get sprite metadata
    const styleId = this.app.vectorChartStyle() || '';
    const spriteMetadata = this.stylesService.getSpriteMetadata(styleId);

    // For each chart layer, use StylesService to extract the icon the same way the renderer does
    const layerInfos: LayerInfo[] = [];
    
    for (const chartLayerId of this.data.layers) {
      if (chartLayerId == null) continue;
      
      const id = String(chartLayerId);
      const visible = this.data.layerVisibility?.[id] ?? true;
      
      // Extract icon and styles for this layer
      const iconData = this.stylesService.extractLayerIcon(globalStyle, id);
      const spriteCoords = iconData?.iconName ? spriteMetadata?.[iconData.iconName] : null;
      const styles = this.stylesService.extractLayerStyles(globalStyle, id);

      // Build layer info with all extracted data
      const layerInfo: LayerInfo = {
        id,
        visible,
        ...styles,
        ...(spriteCoords && { 
          spriteSheet: this.stylesService.getSpriteUrl(globalStyle?.sprite),
          spriteMeta: {
            x: spriteCoords.x,
            y: spriteCoords.y,
            width: spriteCoords.width,
            height: spriteCoords.height,
            pixelRatio: spriteCoords.pixelRatio
          }
        })
      };
      
      layerInfos.push(layerInfo);
    }

    return this.openLayerPropertiesDialog(layerInfos, globalStyle);
  }

  private openLayerPropertiesDialog(layerInfos: LayerInfo[], globalStyle: MapboxStyle | undefined) {
    const dialogRef = this.dialog.open(LayerPropertiesDialog, {
      data: {
        layers: layerInfos,
        chartId: this.data.identifier
      },
      minWidth: '400px',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe((result: LayerInfo[] | undefined) => {
      // Only update if result is provided (user clicked X or closed normally, not cancelled)
      if (result && Array.isArray(result)) {
        // Preserve existing visibility for layers not in result
        const updatedVisibility = { ...this.data.layerVisibility };
        
        // Update visibility for layers in result
        result.forEach((layer) => {
          if (layer && layer.id) {
            updatedVisibility[layer.id] = layer.visible;
          }
        });
        
        this.data.layerVisibility = updatedVisibility;
        
        // Persist layer visibility changes
        if (this.data.identifier) {
          this.skres.updateChartLayerVisibility(
            this.data.identifier,
            updatedVisibility
          );
        }
      }
    });
  }

  protected loadCapabilities() {
    if (this.isFetching() || this.capabilitiesLoaded()) {
      return;
    }
    this.capabilitiesError.set(null);
    this.runWhenIdle(async () => {
      let ok = false;
      if (this.data.type.toLowerCase() === 'wms') {
        ok = await this.getWmsCapabilities();
      } else if (this.data.type.toLowerCase() === 'wmts') {
        ok = await this.getWmtsCapabilities();
      }
      if (ok) {
        this.capabilitiesLoaded.set(true);
      }
    });
  }

  private runWhenIdle(task: () => void) {
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(() => task());
    } else {
      setTimeout(task, 0);
    }
  }

  /**
   * Retrieve and process capabilities from WMS server
   */
  protected async getWmsCapabilities(): Promise<boolean> {
    const cached = ChartPropertiesDialog.wmsLayerCache.get(this.data.url);
    if (cached) {
      this.wmsLayers = this.cloneWmsLayers(cached);
      return true;
    }
    this.wmsLayers = [];
    try {
      this.isFetching.set(true);
      const url = `${this.data.url}?request=getcapabilities&service=wms`;
      const xml = await fetchCapabilitiesXml(url, 8000);
      const workerLayers = await this.parseWmsCapabilitiesInWorker(xml);
      if (!workerLayers) {
        this.capabilitiesError.set('WMS parsing failed in worker.');
        return false;
      }
      const cachedLayers = this.cloneWmsLayers(workerLayers);
      ChartPropertiesDialog.wmsLayerCache.set(this.data.url, cachedLayers);
      this.wmsLayers = this.cloneWmsLayers(cachedLayers);
      return true;
    } catch (err) {
      this.app.debug('Error fetching WMS layers!');
      this.capabilitiesError.set('Failed to load WMS layers.');
      return false;
    } finally {
      this.isFetching.set(false);
    }
  }

  /**
   * Retrieve and process capabilities from WMTS server
   */
  protected async getWmtsCapabilities(): Promise<boolean> {
    const cached = ChartPropertiesDialog.wmtsLayerCache.get(this.data.url);
    if (cached) {
      this.wmtsLayers = this.cloneWmtsLayers(cached);
      return true;
    }
    this.wmtsLayers = [];
    try {
      this.isFetching.set(true);
      const url = `${this.data.url}?request=GetCapabilities&service=wmts`;
      const xml = await fetchCapabilitiesXml(url, 8000);
      const workerLayers = await this.parseWmtsCapabilitiesInWorker(xml);
      if (!workerLayers) {
        this.capabilitiesError.set('WMTS parsing failed in worker.');
        return false;
      }
      ChartPropertiesDialog.wmtsLayerCache.set(this.data.url, workerLayers);
      this.wmtsLayers = this.cloneWmtsLayers(workerLayers);
      return true;
    } catch (err) {
      this.app.debug('Error fetching WMS layers!');
      this.capabilitiesError.set('Failed to load WMTS layers.');
      return false;
    } finally {
      this.isFetching.set(false);
    }
  }

  protected handleLayerSelection(e: string[]) {
    this.data.layers = e;
  }

  protected handleClose(save: boolean) {
    this.dialogRef.close({
      save: save,
      chart: this.data
    });
  }

  private cloneWmsLayers(layers: LayerNode[], parent?: LayerNode): LayerNode[] {
    return layers.map((l) => {
      const node: LayerNode = {
        name: l.name,
        title: l.title,
        description: l.description,
        time: l.time ? { ...l.time } : undefined,
        selected: false,
        parent: parent
      };
      if (Array.isArray(l.children) && l.children.length) {
        node.children = this.cloneWmsLayers(l.children, node);
      }
      return node;
    });
  }

  private cloneWmtsLayers(
    layers: Array<{ id: string | number; name: string; description: string }>
  ) {
    return layers.map((l) => ({ ...l }));
  }

  private parseWmsCapabilitiesInWorker(xml: string): Promise<LayerNode[] | null> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const worker = new Worker(
        new URL('./capabilities.worker', import.meta.url),
        { type: 'module' }
      );
      const cleanup = (result: any) => {
        worker.terminate();
        resolve(Array.isArray(result?.layers) ? result.layers : null);
      };
      worker.onmessage = (event) => cleanup(event.data);
      worker.onerror = () => cleanup(null);
      worker.postMessage({
        type: 'wms',
        xml: xml,
        url: this.data.url,
        options: {
          maxNodes: this.maxWmsNodes,
          maxDepth: this.maxWmsDepth,
          maxLayers: this.maxWmtsLayers
        }
      });
    });
  }

  private parseWmtsCapabilitiesInWorker(
    xml: string
  ): Promise<Array<{ id: string | number; name: string; description: string }> | null> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const worker = new Worker(
        new URL('./capabilities.worker', import.meta.url),
        { type: 'module' }
      );
      const cleanup = (result: any) => {
        worker.terminate();
        resolve(Array.isArray(result?.layers) ? result.layers : null);
      };
      worker.onmessage = (event) => cleanup(event.data);
      worker.onerror = () => cleanup(null);
      worker.postMessage({
        type: 'wmts',
        xml: xml,
        url: this.data.url,
        options: {
          maxNodes: this.maxWmsNodes,
          maxDepth: this.maxWmsDepth,
          maxLayers: this.maxWmtsLayers
        }
      });
    });
  }

  private spriteMetadataCache: Map<string, any> = new Map();
  private spriteFetchPromises: Map<string, Promise<any>> = new Map();

  // DEPRECATED: These methods are not currently used. The dialog now shows the full sprite sheet.
  private preloadSpriteMetadata(jsonUrl: string): Promise<void> {
    if (!jsonUrl) {
      return Promise.resolve();
    }
    const promise = fetch(jsonUrl)
      .then((res) => res.json())
      .then((data) => {
        this.spriteMetadataCache.set(jsonUrl, data);
        this.spriteFetchPromises.delete(jsonUrl);
      })
      .catch((err) => {
        console.error(`Failed to load sprite JSON:`, err);
        this.spriteMetadataCache.set(jsonUrl, null);
        this.spriteFetchPromises.delete(jsonUrl);
      });

    this.spriteFetchPromises.set(jsonUrl, promise);
    return promise.then(() => {});
  }

  // DEPRECATED: Not currently used
  private getLayerSprite(
    layerId: string,
    style?: MapboxStyle
  ): { sheet: string; meta: { x: number; y: number; width: number; height: number; pixelRatio?: number } } | null {
    return null;
  }

  // DEPRECATED: Not currently used  
  private findIconKeyForLayer(layerId: string, style?: MapboxStyle): string | null {
    return null;
  }

  // DEPRECATED: Not currently used
  private loadSpriteMetadata(
    jsonUrl: string,
    pngUrl: string,
    iconKey: string
  ): { sheet: string; meta: { x: number; y: number; width: number; height: number; pixelRatio?: number } } | null {
    return null;
  }
}

