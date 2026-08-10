/**
 * WhatsApp es la vía de contacto habitual del equipo, así que aparece en dos
 * sitios: la ayuda de la pantalla de acceso y la entrega de credenciales de una
 * cuenta nueva. El logotipo y la lectura del número viven aquí para que ambos
 * usen exactamente el mismo criterio.
 */

/**
 * Un contacto es texto libre: puede ser un correo o un teléfono. Devuelve los
 * dígitos en formato internacional, o '' si no parece un número. Un número de 9
 * dígitos sin prefijo se entiende peruano (+51), que es el país de la
 * aplicación; con `+` delante manda lo que se escribió.
 */
export function whatsappNumber(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (contact.trim().startsWith('+')) return digits.length >= 8 ? digits : '';
  if (digits.length === 9) return `51${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

/** Logotipo de WhatsApp: Material Symbols no trae marcas, así que va como SVG. */
export function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}
