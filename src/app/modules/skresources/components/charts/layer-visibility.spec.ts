import { SKChart } from 'src/app/modules/skresources/resource-classes';

describe('Layer Visibility Integration', () => {
  describe('SKChart layerVisibility', () => {
    it('should initialize with empty layerVisibility object', () => {
      const chart = new SKChart({
        identifier: 'test',
        name: 'Test Chart',
        type: 'tilejson',
        url: 'http://example.com',
        layers: ['layer1', 'layer2']
      });

      expect(chart.layerVisibility).toEqual({});
    });

    it('should preserve layerVisibility from resource', () => {
      const chart = new SKChart({
        identifier: 'test',
        name: 'Test Chart',
        type: 'tilejson',
        url: 'http://example.com',
        layers: ['layer1', 'layer2'],
        layerVisibility: {
          layer1: true,
          layer2: false
        }
      });

      expect(chart.layerVisibility).toEqual({
        layer1: true,
        layer2: false
      });
    });

    it('should handle undefined layers array', () => {
      const chart = new SKChart({
        identifier: 'test',
        name: 'Test Chart',
        type: 'tilejson',
        url: 'http://example.com'
      });

      expect(chart.layers).toEqual([]);
      expect(chart.layerVisibility).toEqual({});
    });

    it('should handle null layerVisibility', () => {
      const chart = new SKChart({
        identifier: 'test',
        name: 'Test Chart',
        type: 'tilejson',
        url: 'http://example.com',
        layers: ['layer1'],
        layerVisibility: null as any
      });

      expect(chart.layerVisibility).toEqual({});
    });
  });

  describe('Layer filtering logic', () => {
    it('should filter out invisible layers', () => {
      const allLayers = ['layer1', 'layer2', 'layer3'];
      const layerVisibility = {
        layer1: true,
        layer2: false,
        layer3: true
      };

      const visibleLayers = allLayers.filter(
        (layerId) => layerVisibility[layerId] !== false
      );

      expect(visibleLayers).toEqual(['layer1', 'layer3']);
    });

    it('should include layers with undefined visibility (default to visible)', () => {
      const allLayers = ['layer1', 'layer2', 'layer3'];
      const layerVisibility = {
        layer1: false
        // layer2 and layer3 are undefined
      };

      const visibleLayers = allLayers.filter(
        (layerId) => layerVisibility[layerId] !== false
      );

      expect(visibleLayers).toEqual(['layer2', 'layer3']);
    });

    it('should handle empty layerVisibility object (all visible)', () => {
      const allLayers = ['layer1', 'layer2', 'layer3'];
      const layerVisibility = {};

      const visibleLayers = allLayers.filter(
        (layerId) => layerVisibility[layerId] !== false
      );

      expect(visibleLayers).toEqual(['layer1', 'layer2', 'layer3']);
    });

    it('should handle all layers disabled', () => {
      const allLayers = ['layer1', 'layer2', 'layer3'];
      const layerVisibility = {
        layer1: false,
        layer2: false,
        layer3: false
      };

      const visibleLayers = allLayers.filter(
        (layerId) => layerVisibility[layerId] !== false
      );

      expect(visibleLayers).toEqual([]);
    });

    it('should handle null or undefined layers array', () => {
      const allLayers: string[] = null as any;
      const layerVisibility = { layer1: true };

      expect(() => {
        const visibleLayers = Array.isArray(allLayers)
          ? allLayers.filter((layerId) => layerVisibility[layerId] !== false)
          : null;
        expect(visibleLayers).toBeNull();
      }).not.toThrow();
    });

    it('should handle layer IDs with special characters', () => {
      const allLayers = [
        'layer-1',
        'layer_2',
        'layer.3',
        'layer:4',
        'layer/5'
      ];
      const layerVisibility = {
        'layer-1': true,
        'layer_2': false,
        'layer.3': true,
        'layer:4': true,
        'layer/5': false
      };

      const visibleLayers = allLayers.filter(
        (layerId) => layerVisibility[layerId] !== false
      );

      expect(visibleLayers).toEqual(['layer-1', 'layer.3', 'layer:4']);
    });
  });

  describe('LayerInfo conversion', () => {
    it('should convert string layer to LayerInfo with default visibility', () => {
      const layerId = 'test-layer';
      const layerVisibility: { [key: string]: boolean } = {};

      const layerInfo = {
        id: typeof layerId === 'string' ? layerId : String(layerId),
        visible: layerVisibility[layerId] ?? true
      };

      expect(layerInfo).toEqual({
        id: 'test-layer',
        visible: true
      });
    });

    it('should convert string layer to LayerInfo with stored visibility', () => {
      const layerId = 'test-layer';
      const layerVisibility: { [key: string]: boolean } = {
        'test-layer': false
      };

      const layerInfo = {
        id: typeof layerId === 'string' ? layerId : String(layerId),
        visible: layerVisibility[layerId] ?? true
      };

      expect(layerInfo).toEqual({
        id: 'test-layer',
        visible: false
      });
    });

    it('should handle non-string layer ID', () => {
      const layerId: any = 123;
      const layerVisibility: { [key: string]: boolean } = {};

      const layerInfo = {
        id: typeof layerId === 'string' ? layerId : String(layerId),
        visible: layerVisibility[layerId] ?? true
      };

      expect(layerInfo).toEqual({
        id: '123',
        visible: true
      });
    });

    it('should handle undefined visibility value', () => {
      const layerId = 'test-layer';
      const layerVisibility: { [key: string]: boolean } = {
        'other-layer': true
      };

      const layerInfo = {
        id: typeof layerId === 'string' ? layerId : String(layerId),
        visible: layerVisibility[layerId] ?? true
      };

      expect(layerInfo.visible).toBe(true);
    });

    it('should handle explicit false visibility', () => {
      const layerId = 'test-layer';
      const layerVisibility: { [key: string]: boolean } = {
        'test-layer': false
      };

      const layerInfo = {
        id: typeof layerId === 'string' ? layerId : String(layerId),
        visible: layerVisibility[layerId] ?? true
      };

      expect(layerInfo.visible).toBe(false);
    });
  });
});
