import { provideZoneChangeDetection, APP_INITIALIZER, inject } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  provideHttpClient,
  withInterceptorsFromDi
} from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { StylesService } from './app/lib/services';

/** Initialize vector chart styles before app bootstrap (with timeout) */
export function initializeStyles() {
  const stylesService = inject(StylesService);
  return () => {
    if (!stylesService.isLoaded()) {
      // Load styles but with a 5 second timeout to prevent blocking
      // If styles don't load in time, app proceeds without them
      return Promise.race([
        stylesService.loadStyles(),
        new Promise(resolve => setTimeout(resolve, 5000))
      ]).catch(() => {
        // Silently continue even if styles fail to load
        console.warn('[AppInit] Vector chart styles failed to load, proceeding without them');
        return Promise.resolve();
      });
    }
    return Promise.resolve();
  };
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeStyles,
      multi: true
    }
  ]
}).catch((e) => console.log(e));


