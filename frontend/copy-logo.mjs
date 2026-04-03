import fs from 'fs';
import path from 'path';

const src = 'D:/StationMonitor/logodien.png';
const dst = 'D:/StationMonitor/frontend/public/favico/logodien.png';

fs.copyFileSync(src, dst);
console.log('[OK] logodien.png copied to public/favico/');
