/**
 * VERSION DE PULSO
 *
 * Formato "1986.<entrega>". La entrega sube sola con cada cambio publicado:
 * la escribe scripts/marcar-version.mjs a partir del historial del repositorio.
 * No editar a mano — correr "npm run marcar-version" antes de hacer el commit.
 */
export const APP_VERSION = "1986.479";

/**
 * Publicaciones contadas por marcar-version. El aviso de version nueva y las
 * novedades solo salen cuando cambia AVISO_BLOQUE (cada 6 publicaciones).
 */
export const PUBLICACION = 3;
export const AVISO_BLOQUE = 0;
