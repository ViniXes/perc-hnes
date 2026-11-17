import { isServiceInChiefScope } from "./alcance-servicios";

type PerfilHoras = {
  role?: string; serviceId?: string | null; isActive?: boolean; isMinsal?: boolean;
  mustChangePassword?: boolean; noCapture?: boolean; isChief?: boolean;
  permissions?: { canManageUsers?: boolean }; division?: string | null; department?: string | null;
  viewHoras?: string[]; supervisorModules?: string[]; captureModules?: string[];
};

export function puedeLeerNomina(p: PerfilHoras | undefined, id: string) {
  if (!p || !p.role || p.isActive === false || p.isMinsal || p.mustChangePassword) return false;
  if (p.role === "admin" || p.permissions?.canManageUsers === true || p.viewHoras?.includes(id)) return true;
  if (p.role === "supervisor") return !!p.supervisorModules?.includes("distribucion") && isServiceInChiefScope(p, id);
  return p.role === "service" && p.serviceId === id && !p.noCapture &&
    (p.isChief || !p.captureModules?.length || p.captureModules.includes("distribucion"));
}

// RR. HH. tiene un consolidado hospitalario, pero solo captura en su propio servicio.
export function puedeConsolidarNomina(p: PerfilHoras | undefined, id: string, correoAuth?: string) {
  return puedeLeerNomina(p, id) || (!!p && p.role === "service" && p.serviceId === "rrhh" &&
    p.isActive !== false && !p.isMinsal && !p.mustChangePassword &&
    correoAuth?.toLowerCase() === "aamaya@perc-hnes.app");
}
