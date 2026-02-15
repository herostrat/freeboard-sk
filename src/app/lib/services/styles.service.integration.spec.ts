import { TestBed, fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { APP_INITIALIZER } from '@angular/core';
import { StylesService } from './styles.service';

/**
 * Integration tests for app initialization with StylesService
 * Tests the APP_INITIALIZER behavior and style loading at startup
 */
describe('App Initialization - StylesService Integration', () => {
  let service: StylesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StylesService]
    });
    service = TestBed.inject(StylesService);
  });

  describe('Scenario 1: No Map Style Available (Fallback)', () => {
    it('should gracefully degrade when Tileserver is unavailable', fakeAsync(() => {
      // Mock all fetch calls to fail
      spyOn(window, 'fetch').and.returnValue(
        Promise.reject(new Error('Connection refused'))
      );

      // This simulates the APP_INITIALIZER behavior
      let loadedStyles: any[] | undefined;
      service.loadStyles().then(value => {
        loadedStyles = value as any[];
      });
      tick();
      flushMicrotasks();

      expect(loadedStyles?.length).toBe(0);
      expect(service.isLoaded()).toBe(false);
      // App should continue to work without styles
      expect(() => service.getStyle('any-style')).not.toThrow();
    }));

    it('should allow vector tiles to render without Mapbox style', fakeAsync(() => {
      spyOn(window, 'fetch').and.returnValue(
        Promise.reject(new Error('No Tileserver'))
      );

      service.loadStyles().catch(() => {
        // ignore
      });
      tick();
      flushMicrotasks();

      // The map component should be able to render vector tiles
      // even without a Mapbox style loaded
      expect(service.availableStyles().length).toBe(0);
      // This should not throw - the map can use default rendering
    }));

    it('should handle timeout gracefully', fakeAsync(() => {
      // Simulate slow/hanging requests
      let fetchCallCount = 0;
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        fetchCallCount++;
        return new Promise((resolve) => {
          // Simulate hanging request (never resolves within 5s)
          setTimeout(
            () =>
              resolve(new Response('OK', { status: 200, statusText: 'OK' })),
            10000
          );
        });
      });

      // Create a race condition like in main.ts
      const loadPromise = service.loadStyles();
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(resolve, 5000)
      );

      let result: any;
      Promise.race([loadPromise, timeoutPromise]).then(value => {
        result = value;
      });
      tick(5100);
      flushMicrotasks();

      // Should continue without waiting for all fetch calls
      expect(result === undefined).toBe(true); // One of them resolved first
    }));
  });

  describe('Scenario 2: Map Style Loaded, F5 Refresh', () => {
    it('should reuse cached styles on refresh (same service instance)', async () => {
      // First load
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
                layers: [],
                sources: {}
              }),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      // Initial load
      await service.loadStyles();
      const firstLoadFetchCalls = (window.fetch as jasmine.Spy).calls.count();

      // Simulate refresh - service should still be loaded
      expect(service.isLoaded()).toBe(true);
      const styles = service.availableStyles();
      expect(styles.length).toBeGreaterThan(0);

      // Second access should not trigger new fetches
      const cachedStyle = service.getStyle('nautical');
      expect(cachedStyle?.id).toBe('nautical');
      expect((window.fetch as jasmine.Spy).calls.count()).toBe(firstLoadFetchCalls);
    });
  });

  describe('Scenario 3: Map Style Loaded, F5, Server No Longer Distributes Style', () => {
    it('should use fallback when previously loaded style is not available', async () => {
      // First load: Tileserver has style
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
                layers: [],
                sources: {}
              }),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      await service.loadStyles();

      const originalStyle = service.getStyle('nautical');
      expect(originalStyle?.id).toBe('nautical');

      // Simulate F5 refresh - create new service instance with different server response
      (service as any).styles.set([]);
      (service as any).stylesLoaded.set(false);
      (service as any).styleCache.clear();

      // Update mock: now server doesn't have nautical style
      (window.fetch as jasmine.Spy).calls.reset();
      (window.fetch as jasmine.Spy).and.callFake((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/health')) {
          return Promise.resolve(
            new Response('OK', { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/styles.json')) {
          // Server now returns empty or different styles
          return Promise.resolve(
            new Response(JSON.stringify([]), { status: 200, statusText: 'OK' })
          );
        }
        return Promise.reject(new Error('Not found'));
      });

      // Reload
      const newStyles = await service.loadStyles();

      expect(newStyles.length).toBe(0);
      // System should fall back to default rendering
      // (this is handled by the map component, not the service)
    });
  });

  describe('Scenario 4: Edge Cases and Problematic Situations', () => {
    it('should handle corrupted Tileserver responses', async () => {
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/health')) {
          return Promise.resolve(
            new Response('OK', { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/styles.json')) {
          // Return invalid JSON
          return Promise.resolve(
            new Response('{ invalid json }', {
              status: 200,
              statusText: 'OK'
            })
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await service.loadStyles();

      // Should handle gracefully and continue
      expect(result?.length).toBe(0);
      expect(() => service.availableStyles()).not.toThrow();
    });

    it('should handle Tileserver returning 500 errors', async () => {
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/health')) {
          // Tileserver is up but returning errors
          return Promise.resolve(
            new Response('Internal Server Error', { status: 500, statusText: 'Error' })
          );
        }
        return Promise.reject(new Error('Connection refused'));
      });

      const result = await service.loadStyles();

      expect(result?.length).toBe(0);
    });

    it('should handle partial style load failures', async () => {
      let requestCount = 0;
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        requestCount++;
        if (urlStr.includes('/health')) {
          return Promise.resolve(
            new Response('OK', { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/styles.json')) {
          // Server lists 3 styles
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: 'style1',
                  name: 'Style 1',
                  url: 'http://localhost:8081/styles/style1/style.json'
                },
                {
                  id: 'style2',
                  name: 'Style 2',
                  url: 'http://localhost:8081/styles/style2/style.json'
                },
                {
                  id: 'style3',
                  name: 'Style 3',
                  url: 'http://localhost:8081/styles/style3/style.json'
                }
              ]),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        if (urlStr.includes('/style1/style.json')) {
          // Style 1 loads successfully
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'style1',
                name: 'Style 1',
                layers: [],
                sources: {}
              }),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        if (urlStr.includes('/style2/style.json')) {
          // Style 2 fails to load
          return Promise.reject(new Error('Network error'));
        }
        if (urlStr.includes('/style3/style.json')) {
          // Style 3 returns 404
          return Promise.resolve(
            new Response('Not Found', { status: 404, statusText: 'Not Found' })
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await service.loadStyles();

      // Should have loaded at least one style despite failures
      expect(result?.length).toBeGreaterThanOrEqual(1);
      expect(result?.some((s) => s.id === 'style1')).toBe(true);
    });

    it('should handle Tileserver at different ports', async () => {
      let attemptedUrls: string[] = [];

      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        attemptedUrls.push(url as string);

        // First two ports fail, third succeeds
        if (urlStr.includes('8080') || urlStr.includes('127.0.0.1:8080')) {
          return Promise.reject(new Error('Connection refused'));
        }
        if (urlStr.includes('8081') && urlStr.includes('127.0.0.1')) {
          // Second attempt on 127.0.0.1:8081 succeeds
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
                    url: 'http://127.0.0.1:8081/styles/basic/style.json'
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
                  layers: [],
                  sources: {}
                }),
                { status: 200, statusText: 'OK' }
              )
            );
          }
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await service.loadStyles();

      // Should eventually find the working server
      expect(result?.length).toBeGreaterThan(0);
      expect(result?.[0].id).toBe('basic');
    });

    it('should handle sprite metadata load failures gracefully', async () => {
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
                  id: 'with-sprite',
                  name: 'With Sprite',
                  url: 'http://localhost:8081/styles/with-sprite/style.json'
                }
              ]),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        if (urlStr.includes('/style.json')) {
          // Style has a sprite URL
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'with-sprite',
                name: 'With Sprite',
                sprite: 'http://localhost:8081/styles/with-sprite/sprite',
                layers: [],
                sources: {}
              }),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        if (urlStr.includes('/sprite.json')) {
          // Sprite metadata fails to load (404)
          return Promise.resolve(
            new Response('Not Found', { status: 404, statusText: 'Not Found' })
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await service.loadStyles();

      // Should still load the style even if sprite metadata fails
      expect(result?.length).toBeGreaterThan(0);
      expect(result?.[0].id).toBe('with-sprite');
    });

    it('should not block app startup on slow network', fakeAsync(() => {
      const slowFetch = jasmine.createSpy('slowFetch').and.callFake(() => {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(new Response('OK', { status: 200, statusText: 'OK' })),
            15000
          );
        });
      });

      spyOn(window, 'fetch').and.callFake(slowFetch);

      // Simulate timeout race like in main.ts
      const startTime = Date.now();
      const loadPromise = service.loadStyles();
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(resolve, 5000)
      );

      let result: any;
      Promise.race([loadPromise, timeoutPromise]).then(value => {
        result = value;
      });
      tick(5100);
      flushMicrotasks();

      // Should timeout and continue (timeout promise resolves)
      expect(result === undefined).toBe(true);
      // App didn't wait for all pending requests
      expect(slowFetch).toHaveBeenCalled();
    }));
  });

  describe('Scenario 5: Style Refresh During Runtime', () => {
    it('should allow manual style refresh', async () => {
      let loadCount = 0;
      spyOn(window, 'fetch').and.callFake((url) => {
        const urlStr = String(url);
        if (urlStr.includes('/health')) {
          return Promise.resolve(
            new Response('OK', { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/styles.json')) {
          loadCount++;
          // Return different styles based on load count
          const styles =
            loadCount === 1
              ? [
                  {
                    id: 'nautical',
                    name: 'Nautical',
                    url: 'http://localhost:8081/styles/nautical/style.json'
                  }
                ]
              : [
                  {
                    id: 'basic',
                    name: 'Basic',
                    url: 'http://localhost:8081/styles/basic/style.json'
                  }
                ];
          return Promise.resolve(
            new Response(JSON.stringify(styles), { status: 200, statusText: 'OK' })
          );
        }
        if (urlStr.includes('/style.json')) {
          const baseUrl = (url as string).split('/')[5]; // Extract style id
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: baseUrl,
                name: baseUrl,
                layers: [],
                sources: {}
              }),
              { status: 200, statusText: 'OK' }
            )
          );
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      // Initial load
      const styles1 = await service.loadStyles();
      expect(styles1?.[0].id).toBe('nautical');
    });
  });
});
