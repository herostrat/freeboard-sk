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

export interface LayerInfo {
  id: string;
  visible: boolean;
  sprite?: string;
}

export interface LayerPropertiesData {
  layers: LayerInfo[];
  sprite?: string; // Chart-level sprite URL
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
                  @if (layer.sprite || data.sprite) {
                    <img
                      [src]="layer.sprite || data.sprite"
                      [alt]="layer.id"
                      class="sprite-icon"
                      (error)="onSpriteError($event)"
                    />
                  } @else {
                    <span class="sprite-not-found">N/A</span>
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
        min-width: 400px;
        max-width: 600px;
      }

      .layer-item {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 4px 0;
      }

      .layer-sprite {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .sprite-icon {
        max-width: 24px;
        max-height: 24px;
        object-fit: contain;
      }

      .sprite-not-found {
        font-size: 9px;
        color: #999;
        font-style: italic;
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
  constructor(
    public dialogRef: MatDialogRef<LayerPropertiesDialog>,
    @Inject(MAT_DIALOG_DATA) public data: LayerPropertiesData
  ) {}

  toggleVisibility(layer: LayerInfo) {
    layer.visible = !layer.visible;
  }

  enableAll() {
    this.data.layers.forEach((layer) => (layer.visible = true));
  }

  disableAll() {
    this.data.layers.forEach((layer) => (layer.visible = false));
  }

  handleClose() {
    this.dialogRef.close(this.data.layers);
  }

  onSpriteError(event: Event) {
    // Hide broken sprite images
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
    }
  }
}
