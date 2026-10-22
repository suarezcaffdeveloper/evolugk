import { z } from "zod";

/**
 * Zod 4 prueba `new Function("")` para compilar validadores más rápido. Con una CSP sin
 * `unsafe-eval` el navegador lo reporta como violación aunque zod lo atrape y siga. Sin JIT no hay
 * sondeo; la diferencia de velocidad no se nota en formularios. Se importa desde los esquemas que
 * se cargan en el navegador.
 */
z.config({ jitless: true });
