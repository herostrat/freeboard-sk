import { TestBed } from '@angular/core/testing';
import { StylesService } from './styles.service';
import { MapboxStyle } from 'src/app/types';

describe('StylesService', () => {
  let service: StylesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StylesService]
    });
    service = TestBed.inject(StylesService);
  });

  afterEach(() => {
    // Reset service state between tests
    (service as any).styles.set([]);
    (service as any).stylesLoaded.set(false);
    (service as any).styleCache.clear();
    (service as any).spriteMetadataCache.clear();
  });

  describe('Style Loading', () => {
    it('should load styles from available Tileserver', async () => {
      // Mock fetch to simulate working Tileserver
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/health')) {
          return Promise.resolve(
            new Response('OK', { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/styles.json')) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: 'nautical',
                  name: 'Nautical',
                  url: 'http://localhost:8081/styles/nautical/style.json'
                }
              ]),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        if (urlStr.includes('/style.json')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'nautical',
                name: 'Nautical',
                version: 8,
                layers: [],
                sources: {}
              } as MapboxStyle),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await service.loadStyles();

      expect(result.length).toBeGreaterThan(0);
      expect(service.isLoaded()).toBe(true);
    });

    it('should return empty array if no Tileserver available', async () => {
      // Mock fetch to simulate all Tileservers unavailable
      spyOn(window, 'fetch').and.returnValue(
        Promise.reject(new Error('Connection refused'))
      );

      const result = await service.loadStyles();

      expect(result.length).toBe(0);
      expect(service.isLoaded()).toBe(false);
    });

    it('should return cached styles on second load', async () => {
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/health')) {
          return Promise.resolve(
            new Response('OK', { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/styles.json')) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: 'basic',
                  name: 'Basic',
                  url: 'http://localhost:8081/styles/basic/style.json'
                }
              ]),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        if (urlStr.includes('/style.json')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'basic',
                name: 'Basic',
                version: 8,
                layers: [],
                sources: {}
              } as MapboxStyle),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result1 = await service.loadStyles();
      const fetchCallCount1 = (window.fetch as jasmine.Spy).calls.count();

      // Load again - should use cache
      const result2 = await service.loadStyles();
      const fetchCallCount2 = (window.fetch as jasmine.Spy).calls.count();

      // Second load should not make additional fetch calls
      expect(fetchCallCount2).toBe(fetchCallCount1);
      expect(result2.length).toBe(result1.length);
    });
  });

  describe('Style Extraction (extractLayerIcon)', () => {
    it('should extract icon name from style with symbol layers', () => {
      const mockStyle: MapboxStyle = {
        id: 'test',
        name: 'Test',
        version: 8,
        layers: [
          {
            id: 'poi-lights',
            type: 'symbol',
            'source-layer': 'lights',
            layout: {
              'icon-image': 'lights_icon'
            }
          }
        ],
        sources: {}
      };

      const result = service.extractLayerIcon(mockStyle, 'LIGHTS');

      expect(result).not.toBeNull();
      expect(result?.iconName).toBe('lights_icon');
    });

    it('should extract icon from coalesce expression', () => {
      const mockStyle: MapboxStyle = {
        id: 'test',
        name: 'Test',
        version: 8,
        layers: [
          {
            id: 'poi-obstrn',
            type: 'symbol',
            'source-layer': 'obstrn',
            layout: {
              'icon-image': ['coalesce', ['get', 'symbol_id'], 'obstrn_default']
            }
          }
        ],
        sources: {}
      };

      const result = service.extractLayerIcon(mockStyle, 'OBSTRN');

      expect(result).not.toBeNull();
      expect(result?.iconName).toBe('obstrn_default');
    });

    it('should return null when style is undefined', () => {
      const result = service.extractLayerIcon(undefined, 'LIGHTS');

      expect(result).toBeNull();
    });

    it('should return null when no matching source-layer found', () => {
      const mockStyle: MapboxStyle = {
        id: 'test',
        name: 'Test',
        version: 8,
        layers: [
          {
            id: 'other-layer',
            type: 'fill',
            'source-layer': 'other'
          }
        ],
        sources: {}
      };

      const result = service.extractLayerIcon(mockStyle, 'NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('Style Extraction (extractLayerStyles)', () => {
    it('should extract fill color from style', () => {
      const mockStyle: MapboxStyle = {
        id: 'test',
        name: 'Test',
        version: 8,
        layers: [
          {
            id: 'fill-layer',
            type: 'fill',
            'source-layer': 'land',
            paint: {
              'fill-color': '#ffff00'
            }
          }
        ],
        sources: {}
      };

      const result = service.extractLayerStyles(mockStyle, 'LAND');

      expect(result.fillColor).toBe('#ffff00');
    });

    it('should extract line color and width from style', () => {
      const mockStyle: MapboxStyle = {
        id: 'test',
        name: 'Test',
        version: 8,
        layers: [
          {
            id: 'line-layer',
            type: 'line',
            'source-layer': 'roads',
            paint: {
              'line-color': '#ff0000',
              'line-width': 2
            }
          }
        ],
        sources: {}
      };

      const result = service.extractLayerStyles(mockStyle, 'ROADS');

      expect(result.lineColor).toBe('#ff0000');
      expect(result.lineWidth).toBe(2);
    });

    it('should return empty object when style is undefined', () => {
      const result = service.extractLayerStyles(undefined, 'LAND');

      expect(result).toEqual({});
    });

    it('should return empty object when no matching layers found', () => {
      const mockStyle: MapboxStyle = {
        id: 'test',
        name: 'Test',
        version: 8,
        layers: [],
        sources: {}
      };

      const result = service.extractLayerStyles(mockStyle, 'NONEXISTENT');

      expect(result).toEqual({});
    });
  });

  describe('Sprite URL Handling', () => {
    it('should normalize sprite URL from .json to .png', () => {
      const result = service.getSpriteUrl(
        'http://localhost:8081/styles/nautical/sprite.json'
      );

      expect(result).toBe('http://localhost:8081/styles/nautical/sprite.png');
    });

    it('should keep .png URLs as-is', () => {
      const url = 'http://localhost:8081/styles/nautical/sprite.png';
      const result = service.getSpriteUrl(url);

      expect(result).toBe(url);
    });

    it('should add .png extension if missing', () => {
      const result = service.getSpriteUrl(
        'http://localhost:8081/styles/nautical/sprite'
      );

      expect(result).toBe('http://localhost:8081/styles/nautical/sprite.png');
    });

    it('should return undefined for undefined input', () => {
      const result = service.getSpriteUrl(undefined);

      expect(result).toBeUndefined();
    });
  });

  describe('Caching', () => {
    it('should cache loaded styles', async () => {
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/health')) {
          return Promise.resolve(
            new Response('OK', { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/styles.json')) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: 'cached-style',
                  name: 'Cached',
                  url: 'http://localhost:8081/styles/cached-style/style.json'
                }
              ]),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        if (urlStr.includes('/style.json')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'cached-style',
                name: 'Cached',
                version: 8,
                layers: [],
                sources: {}
              } as MapboxStyle),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      await service.loadStyles();

      const cachedStyle = service.getStyle('cached-style');
      expect(cachedStyle).toBeDefined();
      expect(cachedStyle?.id).toBe('cached-style');
    });
  });

  describe('Edge Cases', () => {
    it('should handle styles with no layers', () => {
      const mockStyle: MapboxStyle = {
        id: 'empty',
        name: 'Empty',
        version: 8,
        layers: [],
        sources: {}
      };

      const iconResult = service.extractLayerIcon(mockStyle, 'ANY');
      const styleResult = service.extractLayerStyles(mockStyle, 'ANY');

      expect(iconResult).toBeNull();
      expect(styleResult).toEqual({});
    });

    it('should handle styles with null layers', () => {
      const mockStyle: any = {
        id: 'null-layers',
        name: 'Null Layers',
        version: 8,
        layers: null,
        sources: {}
      };

      const iconResult = service.extractLayerIcon(mockStyle, 'ANY');
      const styleResult = service.extractLayerStyles(mockStyle, 'ANY');

      expect(iconResult).toBeNull();
      expect(styleResult).toEqual({});
    });

    it('should handle case-insensitive source-layer matching', () => {
      const mockStyle: MapboxStyle = {
        id: 'test',
        name: 'Test',
        version: 8,
        layers: [
          {
            id: 'lights-layer',
            type: 'symbol',
            'source-layer': 'LIGHTS',
            layout: {
              'icon-image': 'lights'
            }
          }
        ],
        sources: {}
      };

      const result1 = service.extractLayerIcon(mockStyle, 'lights');
      const result2 = service.extractLayerIcon(mockStyle, 'LIGHTS');
      const result3 = service.extractLayerIcon(mockStyle, 'LiGhTs');

      expect(result1?.iconName).toBe('lights');
      expect(result2?.iconName).toBe('lights');
      expect(result3?.iconName).toBe('lights');
    });
  });
});
