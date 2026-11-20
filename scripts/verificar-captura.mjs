import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { runInThisContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Carga los módulos reales sin navegador, credenciales ni conexión con Firebase.
const raiz = path.resolve("src/lib");
const cache = new Map();
function cargar(nombre) {
  if (cache.has(nombre)) return cache.get(nombre);
  const codigo = ts.transpileModule(readFileSync(path.join(raiz, nombre + ".ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exp = {};
  cache.set(nombre, exp);
  runInThisContext("(function (require, exports) {" + codigo + "\n})", { filename: nombre + ".ts" })(
    id => id === "server-only" ? {} : cargar(id.replace(/^(@\/lib\/|\.\/)/, "")), exp);
  return exp;
}

const { mezclarHoras, asignarIds, ConflictoHoras } = cargar("horas-mezcla");
const { percEntregado } = cargar("perc-entrega");
const { estadoModulo, moduloEntregado } = cargar("entregas");

test("SEPS: el borrador queda pendiente hasta confirmar, también en Laboratorio", () => {
  const captura = { values: { actividad: { "1": 0 } } };
  const laboratorio = { serviceId: "laboratorio-clinico", laboratorioConDatos: true };
  for (const datos of [captura, laboratorio]) {
    const borrador = { ...datos, estadoEntrega: "borrador" };
    assert.equal(estadoModulo("sesps", borrador), "en-digitacion");
    assert.equal(moduloEntregado("sesps", borrador), false);
    assert.equal(moduloEntregado("sesps", { ...datos, estadoEntrega: "entregado" }), true);
  }
  assert.equal(moduloEntregado("sesps", captura), true);
  assert.equal(moduloEntregado("sesps", { estadoEntrega: "entregado", values: {} }), false);
});
const { permiteReset } = cargar("permisos-cuentas");
const { puedeLeerNomina, puedeConsolidarNomina } = cargar("horas-permisos");
const calendario = cargar("periodos");
const { HORAS_TEMPLATES } = cargar("horas-plantillas-privadas");
const fila = (id, a = "", b = "") => ({ id, name: id, dui: "", docType: "dui", comment: "", hours: { A: a, B: b } });

test("Horas: fusiona cambios por celda y empleado; conserva nuevas filas", () => {
  const base = [fila("A"), fila("B")];
  const edit = [fila("A", "4"), fila("B"), fila("C")];
  const remoto = [fila("A", "", "8"), fila("B", "2"), fila("D")];
  const combinado = [fila("A", "4", "8"), fila("B", "2"), fila("D"), fila("C")];
  assert.deepEqual(mezclarHoras(base, edit, remoto), combinado);
  assert.deepEqual(mezclarHoras(base, edit, combinado), combinado);
});
test("Horas: no pisa conflictos ni restaura filas borradas sin cambios locales", () => {
  assert.throws(() => mezclarHoras([fila("A")], [fila("A", "3")], [fila("A", "4")]), ConflictoHoras);
  assert.throws(() => mezclarHoras([fila("A")], [], [fila("A", "4")]), ConflictoHoras);
  assert.deepEqual(mezclarHoras([fila("A")], [fila("A")], []), []);
  const ids = asignarIds([{ name: "XX" }, { name: "xx" }]).map(f => f.id);
  assert.notEqual(...ids);
});
test("PERC: un cero entregado cuenta; un borrador no; se mantiene el historial previo", () => {
  const values = { x: { y: 0 } };
  assert.equal(percEntregado({ values }), true);
  assert.equal(percEntregado({ values, estadoEntrega: "borrador" }), false);
  assert.equal(percEntregado({ values, estadoEntrega: "entregado" }), true);
  assert.equal(percEntregado({ values: { x: { y: " " } }, estadoEntrega: "entregado" }), false);
  assert.equal(percEntregado(undefined), false);
});
test("Recuperación: distingue gestores, supervisores y destinos protegidos", () => {
  const admin = { role: "admin" }, servicio = { role: "service" };
  const gestor = { role: "service", permissions: { canManageUsers: true } };
  const email = "cuenta-ejemplo@example.org";
  for (const p of [admin, gestor]) assert.equal(permiteReset(p, servicio, email), true);
  for (const p of [{ role: "supervisor" }, { ...admin, isActive: false }, { ...admin, isMinsal: true }, { ...gestor, mustChangePassword: true }])
    assert.equal(permiteReset(p, servicio, email), false);
  for (const destino of [undefined, admin, gestor]) assert.equal(permiteReset(admin, destino, email), false);
  const reglas = readFileSync("firestore.rules", "utf8").split("function isAdmin()")[1].split("function ")[0];
  for (const [, identidad] of reglas.matchAll(/token\.email == '([^']+)'/g))
    assert.equal(permiteReset(admin, servicio, identidad), false);
});
test("Nómina: el perfil recibe solo el alcance autorizado", () => {
  const p = { role: "service", serviceId: "nutricion" };
  assert.equal(puedeLeerNomina(p, "nutricion"), true);
  assert.equal(puedeLeerNomina(p, "enfermeria"), false);
  assert.equal(puedeLeerNomina({ ...p, viewHoras: ["enfermeria"] }, "enfermeria"), true);
  const j = { role: "supervisor", department: "laboratorios", supervisorModules: ["distribucion"] };
  assert.equal(puedeLeerNomina(j, "laboratorio-clinico"), true);
  assert.equal(puedeLeerNomina(j, "enfermeria"), false);
  const rrhh = { ...p, serviceId: "rrhh" };
  assert.equal(puedeLeerNomina(rrhh, "enfermeria"), false);
  assert.equal(puedeConsolidarNomina(rrhh, "enfermeria", "aamaya@perc-hnes.app"), true);
  assert.equal(puedeConsolidarNomina(rrhh, "enfermeria", "otra@example.org"), false);
  for (const denegado of [{ ...p, mustChangePassword: true }, { ...p, isMinsal: true }, { ...p, isActive: false }, undefined])
    assert.equal(puedeLeerNomina(denegado, "nutricion"), false);
});
test("El catálogo público coincide con los metadatos y no contiene empleados", () => {
  const publico = Object.fromEntries(Object.entries(HORAS_TEMPLATES).map(([k, t]) => {
    const { seedEmployees, ...meta } = t;
    assert.ok(Array.isArray(seedEmployees));
    return [k, meta];
  }));
  assert.deepEqual(cargar("horas-templates").HORAS_CATALOGO, publico);
});
test("El cierre de agosto y el cambio de año siguen a El Salvador en distintas zonas", () => {
  const anterior = process.env.TZ;
  try {
    for (const zona of ["UTC", "America/El_Salvador", "America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = zona;
      const civil = s => calendario.fechaHospital(new Date(s));
      const antes = calendario.getCaptureWindow(civil("2026-08-11T20:29:59Z"), [], "perc");
      assert.deepEqual(antes.openDays.map(d => d.getDate()), [7, 10, 11]);
      assert.equal(antes.isOpen, true);
      assert.equal(calendario.getCaptureWindow(civil("2026-08-11T20:30:00Z"), [], "perc").isOpen, false);
      assert.equal(calendario.getCloseMillis(antes.lastOpenDay), Date.parse("2026-08-11T20:30:00Z"));
      assert.equal(calendario.getClosingPeriodId(civil("2027-01-01T05:59:59Z")), "2026-11");
      assert.equal(calendario.getClosingPeriodId(civil("2027-01-01T06:00:00Z")), "2026-12");
      assert.equal(calendario.getCaptureWindow(civil("2026-08-12T16:00:00Z"), ["2026-08-07"], "perc").isOpen, true);
    }
  } finally {
    if (anterior === undefined) delete process.env.TZ; else process.env.TZ = anterior;
  }
});
if (process.argv.includes("--bundle")) test("Los archivos JavaScript públicos no contienen documentos de identidad de la plantilla", () => {
  function archivos(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const f = path.join(dir, e.name);
      return e.isDirectory() ? archivos(f) : f.endsWith(".js") ? [f] : [];
    });
  }
  const docs = new Set(Object.values(HORAS_TEMPLATES).flatMap(t => t.seedEmployees)
    .map(e => typeof e === "object" && e.dui).filter(d => d && d.length >= 8));
  assert.ok(docs.size > 0);
  const js = archivos(".next/static");
  assert.ok(js.length > 0);
  for (const f of js) {
    const s = readFileSync(f, "utf8");
    assert.ok(![...docs].some(d => s.includes(d)), "Identificador privado en " + path.basename(f));
  }
});
