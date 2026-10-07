/* ==========================================================
   CONFIGURACIÓN — es lo único que necesitas editar.
   Ver el instructivo, paso 4.
   ========================================================== */
window.APP_CONFIG = {
  // URL de la aplicación web de Apps Script (termina en /exec).
  // Mientras esté vacía, la app funciona en MODO DEMO (guarda solo en el dispositivo).
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyzS6IY6heP07dz9MGi_jRbbbRpXC674RMesaAXYTWUR6nKQpV1vFdnJ0HRFEG6uXzyNw/exec",

  // La misma clave que pusiste en Code.gs (const CLAVE).
  CLAVE: "hidrantes2026",

  // Listas de respaldo (se usan si aún no se pudo leer la hoja "Listas").
  // Con conexión, la app toma las listas directamente de la hoja de Google.
  LISTAS: {
    MARCAS: ["Apolo", "Aps", "Avk", "Chino", "Chirino", "Clow", "Fundal", "Jinan", "Jones", "Pryn", "Saborio", "Torino", "Trafico"],
    TIPO: ["Multivalvular", "Cabezote"],
    PROVINCIA: ["San José"],
    CANTON: ["Vazquez de Coronado"],
    DISTRITO: ["San Isidro", "Cascajal", "Dulce Nombre de Jesus", "Patalillo", "San Rafael"],
    CUADRILLA: ["Cuadrilla 1", "Cuadrilla 2", "Cuadrilla 3"]
  }
};
