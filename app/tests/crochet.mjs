// Permet de charger traficApi.ts sous Node : ses imports './constants' et './api' (React Native) sont remplacés par
// de petits substituts, et les imports sans extension sont complétés par « .ts ».
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const substituts = { './constants': 'stubs/constants.ts', './api': 'stubs/api.ts' };
registerHooks({
  resolve(spec, contexte, suite) {
    if (spec in substituts) return { url: pathToFileURL(path.join(import.meta.dirname, substituts[spec])).href, shortCircuit: true };
    if (spec.startsWith('.') && !path.extname(spec) && contexte.parentURL) {
      const f = path.resolve(path.dirname(fileURLToPath(contexte.parentURL)), spec + '.ts');
      if (existsSync(f)) return { url: pathToFileURL(f).href, shortCircuit: true };
    }
    return suite(spec, contexte);
  },
});
