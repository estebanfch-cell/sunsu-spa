// Corte de percha leído en solo lectura de la hoja 📊 INVENTARIO (columna F)
// el 2026-10-24 08:40 Ecuador. No se vuelve a escribir en la hoja.
import { round2, skuCode } from "./domain.ts";

export const CORTE_FECHA = "2026-10-24";
/** Reloj de los tickets: la hora de Ecuador guardada como si fuera UTC. */
export const CORTE_TICKET = "2026-10-24T08:40:00.000Z";
/** Reloj de erp_movimientos: ISO real. */
export const CORTE_ERP = "2026-10-24T13:40:00.000Z";

/** SKU corto → unidades en Venta, tal como las muestra sunsu.html. */
export const CORTE_VENTA: Record<string, number> = {
  "HT-001": 0,
  "HT-002": 0,
  "HT-003": 0,
  "HT-004": 2,
  "HT-005": 0,
  "HT-006": 0,
  "HT-007": 19,
  "HT-008": 0,
  "HT-009": 0,
  "HT-010": 5,
  "HT-011": 0,
  "HT-012": 0,
  "HT-013": 0,
  "HT-014": 1,
  "AS-001": 4,
  "AS-002": 11,
  "AS-003": 4,
  "AS-004": 22,
  "AS-005": 17,
  "AS-006": 0,
  "AS-007": 7,
  "AS-008": 0,
  "AS-009": 0,
  "AS-010": 3,
  "ML-001": 11,
  "ML-002": 15,
  "ML-003": 0,
  "ML-004": 5,
  "ML-005": 5,
  "ML-006": 0,
  "ML-007": 7,
  "ML-008": 13,
  "ML-009": 9,
  "ML-010": 5,
  "ML-011": 4,
  "ML-012": 1,
  "ML-013": -1,
  "ML-014": 1,
  "PH-001": 2,
  "PH-002": 0,
  "PH-003": 2,
  "PH-004": 2,
  "PH-005": 2,
  "PH-006": 0,
  "PH-007": 1,
  "PH-008": 1,
  "PH-009": 0,
  "PH-010": 0,
  "PH-011": 0,
  "PH-012": 0,
  "JN-001": 23,
  "JN-002": 0,
  "JN-003": 2,
  "JN-004": 0,
  "JN-005": 15,
  "JN-006": 26,
  "JN-007": 0,
  "JN-008": 21,
  "JN-009": 0,
  "BV-001": 3,
  "SU-001": 0,
  "SU-002": 0,
  "SU-003": 0,
  "SU-004": 3,
  "SU-005": 0,
  "SU-006": 0,
  "SU-007": 0,
  "SU-008": 0,
  "SU-009": 18,
  "VK-001": 0,
  "VK-002": 0,
  "VK-003": 0,
  "VK-004": 0,
  "VK-005": 8,
  "VK-006": 5,
  "VK-007": 7,
  "VK-008": 0,
  "VK-009": 5,
  "VK-010": 7,
  "VK-011": 9,
  "VK-012": 4,
  "VK-013": 19,
  "VK-014": 4,
  "VK-015": 0,
  "VK-016": 9,
  "VK-017": 0,
};

export const CORTE_MIN: Record<string, number> = {
  "HT-002": 3,
  "HT-003": 3,
  "HT-004": 3,
  "HT-005": 3,
  "HT-006": 3,
  "HT-007": 3,
  "HT-008": 3,
  "HT-009": 3,
  "HT-010": 3,
  "HT-011": 3,
  "HT-012": 3,
  "HT-013": 3,
  "HT-014": 3,
  "AS-001": 3,
  "AS-002": 3,
  "AS-003": 3,
  "AS-004": 3,
  "AS-005": 3,
  "AS-006": 3,
  "AS-007": 3,
  "AS-008": 3,
  "AS-009": 3,
  "AS-010": 3,
  "ML-001": 3,
  "ML-002": 3,
  "ML-003": 3,
  "ML-004": 3,
  "ML-005": 3,
  "ML-006": 3,
  "ML-007": 3,
  "ML-008": 3,
  "ML-009": 3,
  "ML-010": 3,
  "ML-011": 3,
  "ML-012": 3,
  "ML-013": 3,
  "ML-014": 3,
  "PH-001": 3,
  "PH-002": 3,
  "PH-003": 3,
  "PH-004": 3,
  "PH-005": 3,
  "PH-006": 3,
  "PH-007": 3,
  "PH-008": 3,
  "PH-009": 3,
  "PH-010": 3,
  "PH-011": 3,
  "PH-012": 3,
  "JN-001": 3,
  "JN-002": 3,
  "JN-003": 3,
  "JN-004": 3,
  "JN-005": 3,
  "JN-006": 3,
  "JN-007": 3,
  "JN-008": 3,
  "JN-009": 3,
  "BV-001": 3,
  "SU-001": 3,
  "SU-002": 3,
  "SU-003": 3,
  "SU-004": 3,
  "SU-005": 3,
  "SU-006": 3,
  "SU-007": 3,
  "SU-008": 3,
  "SU-009": 3,
  "VK-001": 3,
  "VK-002": 3,
  "VK-003": 3,
  "VK-004": 3,
  "VK-005": 3,
  "VK-006": 3,
  "VK-007": 3,
  "VK-008": 3,
  "VK-009": 3,
  "VK-010": 3,
  "VK-011": 3,
  "VK-012": 3,
  "VK-013": 3,
  "VK-014": 3,
  "VK-015": 3,
  "VK-016": 3,
  "VK-017": 3,
};

export function aperturaVenta(sku: string): number {
  const code = skuCode(sku);
  return Object.prototype.hasOwnProperty.call(CORTE_VENTA, code) ? CORTE_VENTA[code] : 0;
}

export function despuesDeTicket(ts: unknown): boolean {
  if (ts == null || ts === "") return false;
  const t = Date.parse(String(ts));
  if (Number.isNaN(t)) return false;
  return t > Date.parse(CORTE_TICKET);
}

export function despuesDeErp(ts: unknown): boolean {
  if (ts == null || ts === "") return false;
  const t = Date.parse(String(ts));
  if (Number.isNaN(t)) return false;
  return t > Date.parse(CORTE_ERP);
}

export interface MovCorte { delta: number; tipo?: string; aprobado?: boolean }

/** La apertura es el saldo de la hoja. Un movimiento posterior no baja de 0 salvo un ajuste explícito. */
export function aplicarTrasCorte(apertura: number, movs: MovCorte[]): { saldo: number; crudo: number; frenado: boolean } {
  let saldo = apertura;
  let crudo = apertura;
  let frenado = false;
  for (const m of movs) {
    crudo = round2(crudo + m.delta);
    const explicito = !!m.aprobado || m.tipo === "ajuste" || m.tipo === "conteo" || m.tipo === "apertura";
    const next = round2(saldo + m.delta);
    if (next < -1e-9 && !explicito) {
      frenado = true;
      saldo = 0;
    } else saldo = next;
  }
  return { saldo, crudo, frenado };
}
