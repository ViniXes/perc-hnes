/**
 * POLITICA DE PRIVACIDAD
 *
 * El texto que el usuario acepta al registrarse y el que se puede volver a leer
 * desde su cuenta. Se separo de la pantalla para que actualizarlo sea cambiar
 * este archivo y subir la version: si PRIVACY_POLICY_VERSION cambia, a quien ya
 * habia aceptado se le vuelve a pedir la aceptacion.
 */
import { APP_VERSION } from "@/lib/version";

export const PRIVACY_POLICY_VERSION = "1.6.2.6";

export function PrivacyPolicyBody() {
  return (
    <>
                <p>
                  <strong className="text-white">1. Desarrollo y versión.</strong> PULSO fue
                  desarrollado por el servicio de <strong className="text-cyan-200">ESDOMED</strong>{" "}
                  (Estadística y Documentos Médicos) del Hospital Nacional, El Salvador. Versión{" "}
                  {APP_VERSION}.
                </p>
                <p>
                  <strong className="text-white">2. Qué es PULSO.</strong> Plataforma institucional
                  interna del Hospital Nacional (El Salvador) para la captura, consolidación y
                  gestión de la producción mensual de los servicios (PERC, SEPS y Distribución de
                  Horas). Su uso es exclusivo del personal autorizado.
                </p>
                <p>
                  <strong className="text-white">3. Marco legal aplicable.</strong> El tratamiento de
                  la información en PULSO se enmarca en la normativa salvadoreña vigente, en
                  particular: la <strong className="text-cyan-200">Ley para la Protección de Datos
                  Personales</strong> (Decreto Legislativo N.° 144, del 12 de noviembre de 2024,
                  publicada en el Diario Oficial el 15 de noviembre de 2024); el{" "}
                  <strong className="text-cyan-200">Código de Salud</strong>; la Ley de Deberes y
                  Derechos de los Pacientes y Prestadores de Servicios de Salud; los{" "}
                  <strong className="text-cyan-200">Lineamientos técnicos para el cumplimiento del
                  secreto profesional en el Sistema Nacional Integrado de Salud</strong> (MINSAL,
                  Acuerdo Ejecutivo N.° 2745 de 2022); y la Ley de Acceso a la Información Pública.
                  Asimismo, PULSO se rige por la <strong className="text-cyan-200">Ley de Ética
                  Gubernamental</strong> y por la <strong className="text-cyan-200">Política y el
                  Sistema de Gestión Antisoborno del Ministerio de Salud (MINSAL)</strong>.
                </p>
                <p>
                  <strong className="text-white">4. Datos que recolectamos.</strong> Al registrarse:
                  sus nombres, apellidos, correo y el servicio al que pertenece. Durante el uso, los
                  datos de producción que usted carga y el registro de sus accesos (fecha, hora y
                  usuario) con fines de seguridad y trazabilidad.
                </p>
                <p>
                  <strong className="text-white">5. Base legal del tratamiento.</strong> El
                  tratamiento se sustenta en su <strong className="text-white">consentimiento
                  informado</strong> —otorgado al aceptar esta política— y en el cumplimiento de las
                  obligaciones legales e institucionales del hospital como entidad pública de salud.
                </p>
                <p>
                  <strong className="text-white">6. Finalidad.</strong> Los datos se usan únicamente
                  para identificarlo, crear su usuario y gestionar la captura mensual de su servicio.
                  No se usan con fines comerciales ni publicitarios, ni se someten a decisiones
                  automatizadas que le afecten.
                </p>
                <p>
                  <strong className="text-white">7. Confidencialidad y secreto profesional.</strong>{" "}
                  La información gestionada en PULSO tiene carácter institucional y confidencial.
                  Todo usuario queda obligado a resguardar el secreto profesional conforme a los
                  Lineamientos del MINSAL y al Código de Salud, absteniéndose de divulgar, reproducir
                  o extraer datos fuera de los fines autorizados, tanto durante como después de su
                  vínculo con la institución.
                </p>
                <p>
                  <strong className="text-white">8. Quién los ve.</strong> Solamente los
                  administradores y supervisores autorizados y usted. No se comparten con terceros
                  ajenos al hospital, salvo requerimiento de autoridad competente conforme a la ley.
                </p>
                <p>
                  <strong className="text-white">9. Dónde se guardan y seguridad.</strong> De forma
                  segura en los servicios de Google Firebase, con acceso restringido por usuario y
                  contraseña y comunicaciones cifradas. Se aplican medidas técnicas y organizativas
                  razonables para proteger la información.
                </p>
                <p>
                  <strong className="text-white">10. Conservación.</strong> Sus datos se conservan
                  mientras su cuenta esté activa y por el plazo que exijan las obligaciones legales,
                  contables y de archivo de la institución. Concluido ese plazo, se eliminan o
                  anonimizan.
                </p>
                <p>
                  <strong className="text-white">11. Sus derechos (ARCO-POL).</strong> Conforme a la
                  Ley para la Protección de Datos Personales, usted puede ejercer sus derechos de{" "}
                  <strong className="text-white">acceso, rectificación, cancelación, oposición,
                  portabilidad, olvido (supresión en entornos digitales) y limitación</strong> del
                  tratamiento. Puede solicitarlos a la administración, que atenderá su petición
                  dentro de los plazos que fija la ley.
                </p>
                <p>
                  <strong className="text-white">12. Incidentes de seguridad.</strong> Ante una
                  vulneración que afecte sus datos personales, la institución adoptará las medidas
                  correctivas y realizará las notificaciones que correspondan conforme a la ley.
                </p>
                <p>
                  <strong className="text-white">13. Aprobación de la cuenta.</strong> El registro no
                  es automático: su solicitud queda pendiente hasta que un administrador la apruebe.
                </p>
                <p>
                  <strong className="text-white">14. Responsabilidad del usuario.</strong> Usted es
                  el único responsable de la información que ingresa. Se compromete a que los datos
                  de producción y demás registros que cargue sean veraces, completos y correspondan a
                  su servicio. El uso de su usuario y contraseña es personal e intransferible;
                  cualquier dato ingresado con sus credenciales se considera realizado por usted. La
                  administración no se hace responsable por errores u omisiones en la información
                  cargada por cada usuario.
                </p>
                <p>
                  <strong className="text-white">15. Uso permitido y usos prohibidos.</strong> PULSO
                  es exclusivo para la gestión de la producción de los servicios del hospital. Queda{" "}
                  <strong className="text-white">prohibido</strong>: ingresar información falsa o
                  alterada; usar el sistema para fines distintos a los autorizados; compartir,
                  ceder o revelar sus credenciales; intentar acceder a datos de otros usuarios o
                  servicios sin autorización; y extraer, copiar o divulgar información confidencial
                  de la institución.
                </p>
                <p>
                  <strong className="text-white">16. Consecuencias del mal uso.</strong> El
                  incumplimiento de esta política o el uso indebido del sistema puede dar lugar a la
                  suspensión o cancelación de la cuenta y a las responsabilidades administrativas,
                  disciplinarias, civiles o penales que establezca la legislación salvadoreña
                  aplicable.
                </p>
                <p>
                  <strong className="text-white">17. Compromiso antisoborno y anticorrupción
                  (MINSAL).</strong> El Hospital Nacional adhiere a la Ley de Ética Gubernamental,
                  al Sistema de Gestión Antisoborno del Ministerio de Salud (MINSAL) y a los
                  estándares internacionales en la materia (norma ISO 37001). Aplicado al uso de
                  PULSO, queda estrictamente <strong className="text-white">prohibido</strong>{" "}
                  ofrecer, prometer, solicitar, dar o aceptar —directa o indirectamente— dinero,
                  dádivas, regalos, comisiones, favores o cualquier ventaja indebida para:{" "}
                  <strong className="text-white">(a)</strong> registrar, alterar, inflar, disminuir,
                  ocultar, agilizar u omitir datos de producción;{" "}
                  <strong className="text-white">(b)</strong> aprobar cuentas, otorgar o ampliar
                  permisos, o habilitar/cerrar tableros de captura fuera de los criterios
                  institucionales; <strong className="text-white">(c)</strong> modificar o emitir
                  consolidados que no reflejen la realidad; o{" "}
                  <strong className="text-white">(d)</strong> favorecer indebidamente a un servicio,
                  usuario o tercero. Se prohíbe además manipular o falsear información para obtener
                  beneficios propios o de terceros o para encubrir irregularidades, así como todo
                  acto de corrupción, tráfico de influencias o conflicto de interés.
                </p>
                <p>
                  <strong className="text-white">18. Deber de denuncia y no represalia.</strong>{" "}
                  Todo usuario que tenga conocimiento o sospecha razonable de un acto de soborno o
                  corrupción relacionado con PULSO debe informarlo por los canales institucionales
                  del MINSAL y del hospital (incluida la Unidad de Ética o la que haga sus veces).
                  La institución garantiza la confidencialidad del denunciante de buena fe y
                  prohíbe toda represalia en su contra. El incumplimiento de estas normas
                  antisoborno puede derivar en responsabilidades administrativas, disciplinarias,
                  civiles y penales conforme a la legislación salvadoreña.
                </p>
                <p>
                  <strong className="text-white">19. Seguridad de su cuenta.</strong> Mantenga su
                  contraseña en secreto y cámbiela en su primer ingreso. Si sospecha que alguien
                  conoce sus credenciales, avise de inmediato a la administración.
                </p>
                <p>
                  <strong className="text-white">20. Contacto y ejercicio de derechos.</strong> Para
                  ejercer sus derechos, corregir o eliminar sus datos, o realizar consultas sobre
                  esta política, comuníquese con la administración del sistema a través del servicio
                  de ESDOMED del Hospital Nacional, El Salvador.
                </p>
                <p>
                  <strong className="text-white">21. Cambios en esta política.</strong> Esta política
                  puede actualizarse para reflejar mejoras del sistema o cambios normativos. El uso
                  continuado de PULSO implica la aceptación de la versión vigente.
                </p>
    </>
  );
}
