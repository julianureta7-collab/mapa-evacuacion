// Configuración de escenarios. Cada escenario define dónde están sus datos
// y cómo se dibujan. Agregar un escenario = agregar una entrada aquí + su carpeta en /data.

export const ESTILOS = {
  area_evacuar:     { color: '#e85d04', weight: 1, fillColor: '#e85d04', fillOpacity: 0.22 },
  vias_evacuacion:  { color: '#0a7d3b', weight: 5, opacity: 0.9 },
  linea_segura:     { color: '#1565c0', weight: 3, dashArray: '8 6' },
  cota_30:          { color: '#6b7b8c', weight: 1.5, opacity: 0.8 },
  punto_encuentro:  { radius: 8, color: '#ffffff', weight: 2, fillColor: '#1b9e4b', fillOpacity: 1 },
};

export const ESCENARIOS = {
  tsunami_vina: {
    nombre: 'Viña del Mar · Tsunami',
    amenaza: 'tsunami',
    carpeta: 'data/tsunami_vina',
    centro: [-32.995, -71.545],
    zoom: 14,
    origenDatos: 'oficial',
    capas: [
      { archivo: 'area_evacuar',     nombre: 'Área a evacuar',        tipo: 'poligono', visible: true },
      { archivo: 'cota_30',          nombre: 'Cota 30 m',             tipo: 'linea',    visible: false },
      { archivo: 'linea_segura',     nombre: 'Línea segura',          tipo: 'linea',    visible: true },
      { archivo: 'vias_evacuacion',  nombre: 'Vías de evacuación',    tipo: 'linea',    visible: true },
      { archivo: 'puntos_encuentro', nombre: 'Puntos de encuentro',   tipo: 'punto',    visible: true, estilo: 'punto_encuentro' },
    ],
    ficha: 'Si sientes un sismo fuerte que te impide mantenerte en pie, o suena la alarma de tsunami, evacúa de inmediato a pie hacia la zona segura, sobre la cota 30. No esperes la confirmación oficial ni vuelvas por tus cosas. Sigue las vías de evacuación marcadas en verde hasta el punto de encuentro más cercano.',
  },
  campus_sj: {
    nombre: 'Campus San Joaquín · Sismo e incendio',
    amenaza: 'sismo',
    carpeta: 'data/campus_sj',
    centro: [-33.4985, -70.6140],
    zoom: 17,
    origenDatos: 'propio',
    pendiente: true, // se activa cuando existan las zonas de seguridad levantadas
    capas: [],
    ficha: 'Durante un sismo, protégete y espera que termine. Luego sal con calma hacia la zona de seguridad indicada. Si hay incendio en un edificio, aléjate de él.',
  },
};

export const ESCENARIO_INICIAL = 'tsunami_vina';
