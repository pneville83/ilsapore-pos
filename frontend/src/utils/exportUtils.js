// frontend/src/utils/exportUtils.js
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

/**
 * Función genérica para exportar un array de datos JSON a un archivo Excel.
 * @param {Array<Object>} data - El array de datos a exportar.
 * @param {string} fileName - El nombre del archivo Excel a generar (sin la extensión .xlsx).
 */
export const exportToExcel = (data, fileName) => {
  // 1. Crear una nueva "hoja de trabajo" (worksheet) a partir de nuestros datos JSON.
  const ws = XLSX.utils.json_to_sheet(data);

  // 2. Crear un nuevo "libro de trabajo" (workbook) y añadirle la hoja que acabamos de crear.
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte'); // 'Reporte' es el nombre de la pestaña en Excel.

  // 3. Generar el archivo Excel en formato binario.
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  // 4. Crear un Blob (un objeto de archivo) a partir de los datos binarios.
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF--8' });

  // 5. Usar file-saver para iniciar la descarga del archivo.
  saveAs(blob, `${fileName}.xlsx`);
};