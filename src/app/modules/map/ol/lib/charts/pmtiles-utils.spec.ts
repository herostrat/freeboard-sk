import { initPMTilesVectorLayer } from './pmtiles-utils';
import { SKChart } from 'src/app/modules/skresources/resource-classes';

describe('pmtiles-utils', () => {
  describe('initPMTilesVectorLayer', () => {
    const createTestChart = (
      layers?: string[],
      layerVisibility?: { [key: string]: boolean }
    ): SKChart => {
      return new SKChart({
        identifier: 'test',
        name: 'Test Chart',
        type: 'tilejson',
        url: 'http://example.com/tiles.pmtiles',
        minzoom: 0,
        maxzoom: 14,
        layers: layers,
        layerVisibility: layerVisibility
      });
    };

    it('should create layer when no layers are specified', () => {
      const chart = createTestChart();
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
      expect(layer?.getZIndex()).toBe(1);
    });

    it('should create layer when layers exist and all are visible', () => {
      const chart = createTestChart(['layer1', 'layer2'], {
        layer1: true,
        layer2: true
      });
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
    });

    it('should create layer when some layers are visible', () => {
      const chart = createTestChart(['layer1', 'layer2', 'layer3'], {
        layer1: true,
        layer2: false,
        layer3: true
      });
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
    });

    it('should return null when all layers are hidden', () => {
      const chart = createTestChart(['layer1', 'layer2'], {
        layer1: false,
        layer2: false
      });
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).toBeNull();
    });

    it('should create layer when layers exist but visibility is not defined (default to visible)', () => {
      const chart = createTestChart(['layer1', 'layer2']);
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
    });

    it('should treat undefined visibility as visible', () => {
      const chart = createTestChart(['layer1', 'layer2'], {
        layer1: false
        // layer2 visibility is undefined
      });
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
    });

    it('should handle empty layers array (no filtering)', () => {
      const chart = createTestChart([]);
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
    });

    it('should set correct opacity from chart', () => {
      const chart = createTestChart();
      chart.defaultOpacity = 0.5;
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer?.getOpacity()).toBe(0.5);
    });

    it('should use default opacity when not specified', () => {
      const chart = createTestChart();
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer?.getOpacity()).toBe(1);
    });

    it('should set min and max zoom from chart', () => {
      const chart = createTestChart();
      chart.minZoom = 2;
      chart.maxZoom = 12;
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer?.getMinZoom()).toBe(2);
      expect(layer?.getMaxZoom()).toBe(12);
    });

    it('should handle layer with special characters in ID', () => {
      const chart = createTestChart(['layer-1', 'layer_2', 'layer.3'], {
        'layer-1': true,
        'layer_2': false,
        'layer.3': true
      });
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
    });

    it('should handle very large number of layers', () => {
      const layers: string[] = [];
      const visibility: { [key: string]: boolean } = {};
      
      for (let i = 0; i < 100; i++) {
        layers.push(`layer${i}`);
        visibility[`layer${i}`] = i % 2 === 0; // Every other layer visible
      }
      
      const chart = createTestChart(layers, visibility);
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).not.toBeNull();
    });

    it('should return null when large number of layers all hidden', () => {
      const layers: string[] = [];
      const visibility: { [key: string]: boolean } = {};
      
      for (let i = 0; i < 100; i++) {
        layers.push(`layer${i}`);
        visibility[`layer${i}`] = false;
      }
      
      const chart = createTestChart(layers, visibility);
      const layer = initPMTilesVectorLayer(chart, 1);

      expect(layer).toBeNull();
    });
  });
});
