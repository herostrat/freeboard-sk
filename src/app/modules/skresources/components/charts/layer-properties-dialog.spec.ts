import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import {
  LayerPropertiesDialog,
  LayerPropertiesData,
  LayerInfo
} from './layer-properties-dialog';

describe('LayerPropertiesDialog', () => {
  let component: LayerPropertiesDialog;
  let fixture: ComponentFixture<LayerPropertiesDialog>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<LayerPropertiesDialog>>;

  const createTestData = (
    layers: LayerInfo[],
    sprite?: string
  ): LayerPropertiesData => ({
    layers,
    sprite
  });

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [LayerPropertiesDialog],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: createTestData([
            { id: 'layer1', visible: true },
            { id: 'layer2', visible: false }
          ])
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LayerPropertiesDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('toggleVisibility', () => {
    it('should toggle layer visibility from true to false', () => {
      const layer: LayerInfo = { id: 'test', visible: true };
      component.toggleVisibility(layer);
      expect(layer.visible).toBe(false);
    });

    it('should toggle layer visibility from false to true', () => {
      const layer: LayerInfo = { id: 'test', visible: false };
      component.toggleVisibility(layer);
      expect(layer.visible).toBe(true);
    });

    it('should handle multiple toggles correctly', () => {
      const layer: LayerInfo = { id: 'test', visible: true };
      component.toggleVisibility(layer);
      expect(layer.visible).toBe(false);
      component.toggleVisibility(layer);
      expect(layer.visible).toBe(true);
      component.toggleVisibility(layer);
      expect(layer.visible).toBe(false);
    });
  });

  describe('enableAll', () => {
    it('should enable all layers', () => {
      const data = createTestData([
        { id: 'layer1', visible: false },
        { id: 'layer2', visible: false },
        { id: 'layer3', visible: true }
      ]);
      component.data = data;

      component.enableAll();

      expect(data.layers.every((l) => l.visible)).toBe(true);
    });

    it('should handle empty layers array', () => {
      const data = createTestData([]);
      component.data = data;

      component.enableAll();

      expect(data.layers.length).toBe(0);
    });
  });

  describe('disableAll', () => {
    it('should disable all layers', () => {
      const data = createTestData([
        { id: 'layer1', visible: true },
        { id: 'layer2', visible: true },
        { id: 'layer3', visible: false }
      ]);
      component.data = data;

      component.disableAll();

      expect(data.layers.every((l) => !l.visible)).toBe(true);
    });

    it('should handle empty layers array', () => {
      const data = createTestData([]);
      component.data = data;

      component.disableAll();

      expect(data.layers.length).toBe(0);
    });
  });

  describe('handleClose', () => {
    it('should close dialog with layer data', () => {
      const layers = [
        { id: 'layer1', visible: true },
        { id: 'layer2', visible: false }
      ];
      component.data = createTestData(layers);

      component.handleClose();

      expect(mockDialogRef.close).toHaveBeenCalledWith(layers);
    });
  });

  describe('onSpriteError', () => {
    it('should hide img element on error', () => {
      const mockImg = document.createElement('img');
      mockImg.style.display = 'block';
      const event = { target: mockImg } as unknown as Event;

      component.onSpriteError(event);

      expect(mockImg.style.display).toBe('none');
    });

    it('should handle null target safely', () => {
      const event = { target: null } as unknown as Event;

      expect(() => component.onSpriteError(event)).not.toThrow();
    });

    it('should handle non-img target safely', () => {
      const event = { target: document.createElement('div') } as unknown as Event;

      expect(() => component.onSpriteError(event)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle layer with special characters in id', () => {
      const layer: LayerInfo = {
        id: 'layer-with-special_chars.123!@#',
        visible: true
      };
      expect(() => component.toggleVisibility(layer)).not.toThrow();
    });

    it('should handle layer with empty id', () => {
      const layer: LayerInfo = { id: '', visible: true };
      expect(() => component.toggleVisibility(layer)).not.toThrow();
    });

    it('should handle layer with undefined sprite', () => {
      const data = createTestData([{ id: 'layer1', visible: true }]);
      component.data = data;

      expect(component.data.layers[0].sprite).toBeUndefined();
      expect(component.data.sprite).toBeUndefined();
    });

    it('should handle layer with sprite property', () => {
      const data = createTestData([
        { id: 'layer1', visible: true, sprite: 'http://example.com/sprite.png' }
      ]);
      component.data = data;

      expect(component.data.layers[0].sprite).toBe(
        'http://example.com/sprite.png'
      );
    });

    it('should handle chart-level sprite', () => {
      const data = createTestData(
        [{ id: 'layer1', visible: true }],
        'http://example.com/chart-sprite.png'
      );
      component.data = data;

      expect(component.data.sprite).toBe('http://example.com/chart-sprite.png');
    });

    it('should handle very large number of layers', () => {
      const layers: LayerInfo[] = [];
      for (let i = 0; i < 1000; i++) {
        layers.push({ id: `layer${i}`, visible: i % 2 === 0 });
      }
      const data = createTestData(layers);
      component.data = data;

      component.enableAll();
      expect(data.layers.every((l) => l.visible)).toBe(true);

      component.disableAll();
      expect(data.layers.every((l) => !l.visible)).toBe(true);
    });
  });
});
