/**
 * MARCA LA VERSION DE PULSO
 *
 * La versión es "1986.<número de entrega>", y el número de entrega es la
 * cantidad de commits del repositorio contando el que se está por hacer. Así
 * nadie tiene que acordarse de subirlo a mano ni se repite un número.
 *
 * Escribe dos archivos, que SIEMPRE deben ir juntos:
 *   - src/lib/version.ts   -> lo que se ve en el pie del menú y en el aviso.
 *   - public/sw.js         -> el nombre de la caché. Al cambiar, el navegador
 *                             detecta la versión nueva y ofrece actualizar.
 *
 * Uso:  npm run marcar-version
 * Después: git add -A && git commit
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SERIE = 1986;

const commits = Number.parseInt(
  execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(),
  10,
);
if (!Number.isFinite(commits)) {
  console.error("No pude contar los commits del repositorio.");
  process.exit(1);
}

// +1: el commit que se está por hacer es el de esta versión.
const entrega = commits + 1;
const version = `${SERIE}.${entrega}`;

writeFileSync(
  "src/lib/version.ts",
  `/**
 * VERSION DE PULSO
 *
 * Formato "${SERIE}.<entrega>". La entrega sube sola con cada cambio publicado:
 * la escribe scripts/marcar-version.mjs a partir del historial del repositorio.
 * No editar a mano — correr "npm run marcar-version" antes de hacer el commit.
 */
export const APP_VERSION = "${version}";
`,
  "utf8",
);

const sw = readFileSync("public/sw.js", "utf8");
const patron = /^const CACHE = "[^"]*";/m;
if (!patron.test(sw)) {
  console.error("No encontré la línea 'const CACHE = ...' en public/sw.js.");
  process.exit(1);
}
writeFileSync("public/sw.js", sw.replace(patron, `const CACHE = "pulso-${version}";`), "utf8");

console.log(`Versión marcada: ${version}  (caché: pulso-${version})`);
