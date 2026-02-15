import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconButton } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SKResourceService } from '../../resources.service';

export interface LayerInfo {
  id: string;
  visible: boolean;
  spriteSheet?: string;
  spriteMeta?: {
    x: number;
    y: number;
    width: number;
    height: number;
    pixelRatio?: number;
  };
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
}

export interface LayerPropertiesData {
  layers: LayerInfo[];
  chartId?: string;
}

@Component({
  selector: 'layer-properties-dialog',
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    MatButtonModule,
    MatToolbarModule,
    MatListModule,
    MatTooltipModule
  ],
  template: `
    <div class="layer-properties">
      <mat-toolbar style="background-color: transparent">
        <span class="dialog-icon">
          <mat-icon>layers</mat-icon>
        </span>
        <span style="flex: 1 1 auto; text-align: center">Layer Properties</span>
        <span style="text-align: right">
          <button mat-icon-button (click)="handleClose()">
            <mat-icon>close</mat-icon>
          </button>
        </span>
      </mat-toolbar>
      <mat-dialog-content>
        <div style="padding: 8px 16px; display: flex; gap: 8px; border-bottom: 1px solid rgba(0,0,0,0.1);">
          <button mat-button (click)="enableAll()" matTooltip="Show all layers">
            <mat-icon>visibility</mat-icon>
            Enable All
          </button>
          <button mat-button (click)="disableAll()" matTooltip="Hide all layers">
            <mat-icon>visibility_off</mat-icon>
            Disable All
          </button>
        </div>
        <mat-list>
          @for (layer of data.layers; track layer.id) {
            <mat-list-item>
              <div class="layer-item">
                <button
                  mat-icon-button
                  (click)="toggleVisibility(layer)"
                  [matTooltip]="layer.visible ? 'Hide layer' : 'Show layer'"
                >
                  <mat-icon>
                    {{ layer.visible ? 'visibility' : 'visibility_off' }}
                  </mat-icon>
                </button>
                <div class="layer-sprite">
                  @if (layer.spriteMeta && layer.spriteSheet) {
                    <div
                      class="sprite-preview"
                      [style]="getSpriteStyle(layer)"
                    ></div>
                  } @else if (layer.fillColor) {
                    <div
                      class="fill-preview"
                      [style]="'background-color:' + layer.fillColor"
                    ></div>
                  } @else if (layer.lineColor) {
                    <div
                      class="line-preview"
                      [style]="'border-top: 4px solid ' + layer.lineColor"
                    ></div>
                  } @else {
                    <mat-icon class="default-layer-icon" matTooltip="Layer icon not available">layers</mat-icon>
                  }
                </div>
                <div class="layer-name">{{ layer.id }}</div>
              </div>
            </mat-list-item>
          }
        </mat-list>
        @if (data.layers.length === 0) {
          <div style="padding: 16px; text-align: center; color: gray;">
            No layers available
          </div>
        }
      </mat-dialog-content>
    </div>
  `,
  styles: [
    `
      .layer-properties {
        font-family: arial;
        min-width: 500px;
        max-width: 800px;
        max-height: 80vh;
      }

      .layer-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 4px 0;
      }

      .layer-sprite {
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .sprite-icon {
        max-width: 40px;
        max-height: 40px;
        object-fit: contain;
      }

      .sprite-preview {
        background-repeat: no-repeat;
        image-rendering: auto;
      }

      .fill-preview {
        width: 35px;
        height: 35px;
        border: 1px solid #ccc;
        border-radius: 2px;
      }

      .line-preview {
        width: 35px;
        height: 2px;
      }

      .sprite-not-found {
        font-size: 9px;
        color: #999;
        font-style: italic;
      }

      .default-layer-icon {
        color: #999;
        font-size: 20px;
      }

      .layer-name {
        flex: 1;
        font-size: 14px;
      }

      mat-list-item {
        height: auto !important;
      }
    `
  ]
})
export class LayerPropertiesDialog {
  private spriteStyleCache = new Map<string, string>();

  constructor(
    public dialogRef: MatDialogRef<LayerPropertiesDialog>,
    @Inject(MAT_DIALOG_DATA) public data: LayerPropertiesData,
    private skres: SKResourceService
  ) {}

  toggleVisibility(layer: LayerInfo) {
    layer.visible = !layer.visible;
    this.persistVisibility();
  }

  enableAll() {
    this.data.layers.forEach((layer) => (layer.visible = true));
    this.persistVisibility();
  }

  disableAll() {
    this.data.layers.forEach((layer) => (layer.visible = false));
    this.persistVisibility();
  }

  handleClose() {
    this.dialogRef.close(this.data.layers);
  }

  getSpriteStyle(layer: LayerInfo): string {
    if (!layer.spriteMeta || !layer.spriteSheet) {
      return '';
    }

    // Check cache first
    if (this.spriteStyleCache.has(layer.id)) {
      return this.spriteStyleCache.get(layer.id)!;
    }

    const ratio = layer.spriteMeta.pixelRatio ?? 1;
    const width = Math.max(1, Math.round(layer.spriteMeta.width / ratio));
    const height = Math.max(1, Math.round(layer.spriteMeta.height / ratio));
    const x = Math.round(layer.spriteMeta.x / ratio);
    const y = Math.round(layer.spriteMeta.y / ratio);

    const style = `width:${width}px;height:${height}px;background-image:url('${layer.spriteSheet}');background-position:-${x}px -${y}px;background-repeat:no-repeat;background-size:auto;`;
    
    // Cache the computed style
    this.spriteStyleCache.set(layer.id, style);

    return style;
  }

  private persistVisibility() {
    if (!this.data.chartId) {
      return;
    }

    const visibilityMap: { [layerId: string]: boolean } = {};
    this.data.layers.forEach((layer) => {
      visibilityMap[layer.id] = layer.visible;
    });
    this.skres.updateChartLayerVisibility(this.data.chartId, visibilityMap);
  }
}
