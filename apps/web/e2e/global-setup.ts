import { purgeE2eLeftovers } from "./helpers";

/** Antes de empezar, borra las escuelas e2e que dejó una corrida anterior cortada a la mitad. */
export default async function globalSetup() {
  await purgeE2eLeftovers();
}
