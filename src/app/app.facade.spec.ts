import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppFacade } from './app.facade';
import { SignalKClient } from 'signalk-client-angular';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SKWorkerService } from './modules';
import { S57Service } from './modules/map/ol';
import { defaultConfig } from './app.config';
import type { IAppConfig } from './types';

class MockSignalKClient {
  public serverSettings: IAppConfig = defaultConfig();
  public api = {
    get: () => of({})
  };

  isLoggedIn() {
    return of(true);
  }

  appDataGet() {
    return of(this.serverSettings);
  }

  appDataSet() {
    return of(true);
  }

  setAppId() {}
  setAppVersion() {}
}

class MockMatIconRegistry {
  addSvgIcon() {}
}

class MockDomSanitizer {
  bypassSecurityTrustResourceUrl(url: string) {
    return url;
  }
}

class MockWorkerService {
  resource$() {
    return of([]);
  }
}

class MockS57Service {
  init() {}
}

describe('AppFacade loadSettingsfromServer', () => {
  let app: AppFacade;
  let signalk: MockSignalKClient;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AppFacade,
        { provide: SignalKClient, useClass: MockSignalKClient },
        { provide: MatIconRegistry, useClass: MockMatIconRegistry },
        { provide: DomSanitizer, useClass: MockDomSanitizer },
        { provide: MatDialog, useValue: {} },
        { provide: MatSnackBar, useValue: {} },
        { provide: SKWorkerService, useClass: MockWorkerService },
        { provide: S57Service, useClass: MockS57Service }
      ]
    });

    app = TestBed.inject(AppFacade);
    signalk = TestBed.inject(SignalKClient) as unknown as MockSignalKClient;
  });

  it('merges local selections when server selections are empty', () => {
    const localSelections = app.config.selections;
    localSelections.charts = ['local-chart'];
    localSelections.chartOrder = ['local-chart'];
    localSelections.chartOpacity = { 'local-chart': 0.5 };
    localSelections.chartLayerVisibility = {
      'local-chart': { layerA: false }
    };

    const serverSettings = defaultConfig();
    serverSettings.selections.charts = [];
    serverSettings.selections.chartOrder = [];
    serverSettings.selections.chartOpacity = {};
    serverSettings.selections.chartLayerVisibility = {};

    signalk.serverSettings = serverSettings;

    app.loadSettingsfromServer();

    expect(app.config.selections.charts).toEqual(['local-chart']);
    expect(app.config.selections.chartOrder).toEqual(['local-chart']);
    expect(app.config.selections.chartOpacity).toEqual({
      'local-chart': 0.5
    });
    expect(app.config.selections.chartLayerVisibility).toEqual({
      'local-chart': { layerA: false }
    });
  });

  it('keeps server selections when they are provided', () => {
    const localSelections = app.config.selections;
    localSelections.charts = ['local-chart'];
    localSelections.chartOrder = ['local-chart'];

    const serverSettings = defaultConfig();
    serverSettings.selections.charts = ['server-chart'];
    serverSettings.selections.chartOrder = ['server-chart'];

    signalk.serverSettings = serverSettings;

    app.loadSettingsfromServer();

    expect(app.config.selections.charts).toEqual(['server-chart']);
    expect(app.config.selections.chartOrder).toEqual(['server-chart']);
  });

  it('merges chartOpacity and chartLayerVisibility maps', () => {
    const localSelections = app.config.selections;
    localSelections.chartOpacity = { 'local-chart': 0.4 };
    localSelections.chartLayerVisibility = {
      'local-chart': { layerA: true }
    };

    const serverSettings = defaultConfig();
    serverSettings.selections.chartOpacity = { 'server-chart': 0.8 };
    serverSettings.selections.chartLayerVisibility = {
      'server-chart': { layerB: false }
    };

    signalk.serverSettings = serverSettings;

    app.loadSettingsfromServer();

    expect(app.config.selections.chartOpacity).toEqual({
      'server-chart': 0.8,
      'local-chart': 0.4
    });
    expect(app.config.selections.chartLayerVisibility).toEqual({
      'server-chart': { layerB: false },
      'local-chart': { layerA: true }
    });
  });
});
