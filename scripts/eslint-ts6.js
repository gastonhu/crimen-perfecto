// typescript-eslint todavía no soporta TypeScript 7 (el tsc nativo no expone la API de JS). Mientras tanto, cuando
// typescript-eslint pide `typescript` le damos `@typescript/typescript6`, el paquete oficial con la API clásica.
// El build y el chequeo de tipos siguen usando TS 7. Se importa antes que nada en eslint.config.js.
import { registerHooks } from 'node:module';

const LINT_PKGS = /[\\/]node_modules[\\/](@typescript-eslint[\\/]|typescript-eslint[\\/]|ts-api-utils[\\/])/;

registerHooks({
  resolve(specifier, context, next) {
    if ((specifier === 'typescript' || specifier.startsWith('typescript/')) && LINT_PKGS.test(context.parentURL ?? ''))
      return next(specifier.replace(/^typescript/, '@typescript/typescript6'), context);
    return next(specifier, context);
  },
});
