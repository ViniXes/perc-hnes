type Perfil = {
  role?: string; isActive?: boolean; isMinsal?: boolean; mustChangePassword?: boolean;
  permissions?: { canManageUsers?: boolean };
};

export function gestionaUsuarios(perfil?: Perfil) {
  return !!perfil && perfil.isActive !== false && !perfil.isMinsal &&
    !perfil.mustChangePassword && (perfil.role === "admin" || perfil.permissions?.canManageUsers === true);
}

// Firestore también reconoce administradores por identidad de Auth, aunque el perfil sea de servicio.
const identidadesProtegidas = new Set([
  ...["hcardoza.admin", "ffuentes", "amontes", "jcmiranda", "dalvarez", "jhernandez", "vhernandez", "rcenteno"]
    .map(nombre => nombre + "@perc-hnes.app"),
  process.env.NEXT_PUBLIC_ADMIN_EMAIL?.trim().toLowerCase(),
]);

export function permiteReset(perfil: Perfil | undefined, destino: Perfil | undefined, email: string | undefined) {
  return gestionaUsuarios(perfil) && !!destino && !!destino.role &&
    !!email && !identidadesProtegidas.has(email.trim().toLowerCase()) &&
    destino.role !== "admin" && destino.permissions?.canManageUsers !== true;
}
