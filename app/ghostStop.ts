import type { LineChip } from './api';

export const GHOST_STOP_ID = 'ghost:test';
export const GHOST_STOP_LABEL = 'Villecresnes (dev)';
export const GHOST_STOP_NAME = 'Villecresnes';
export const GHOST_STOP_COORD = { lat: 48.72639, lon: 2.53444 };

export const GHOST_CHIPS: LineChip[] = [
  { id: 'ghost:rera',  code: 'A',   color: 'E2231A', textColor: '#ffffff', mode: 'RER'   },
  { id: 'ghost:rerf',  code: 'F',   color: 'FF6600', textColor: '#ffffff', mode: 'RER'   },
  { id: 'ghost:trainw',code: 'W',   color: 'E4007C', textColor: '#ffffff', mode: 'TRAIN' },
  { id: 'ghost:m18',   code: '18',  color: '00a093', textColor: '#ffffff', mode: 'METRO' },
  { id: 'ghost:m19',   code: '19',  color: 'D5A800', textColor: '#000000', mode: 'METRO' },
  { id: 'ghost:t15',   code: 'T15', color: '003DA5', textColor: '#ffffff', mode: 'TRAM'  },
  { id: 'ghost:c2',    code: 'C2',  color: 'F8A01D', textColor: '#000000', mode: 'CABLE' },
  { id: 'ghost:423',   code: '423', color: '0066CC', textColor: '#ffffff', mode: 'BUS'   },
  { id: 'ghost:9467',  code: '9467',color: '0066CC', textColor: '#ffffff', mode: 'BUS'   },
  { id: 'ghost:n67',   code: 'N67', color: '003189', textColor: '#ffffff', mode: 'BUS'   },
  { id: 'ghost:brf',   code: 'F',  color: 'FF6600', textColor: '#ffffff', mode: 'BUS'   },
];
