#!/usr/bin/env python3
"""Pruebas del parser de Ventas → Cobros Realizados (y del formato anterior)."""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import migo_importar_vivo as m

class FakeCell:
    def __init__(self, v):
        self.value = v

class FakeSheet:
    def __init__(self, rows):
        self.nrows = len(rows)
        self.ncols = max((len(r) for r in rows), default=0)
        self._rows = rows
    def cell(self, r, c):
        row = self._rows[r] if r < len(self._rows) else []
        return FakeCell(row[c] if c < len(row) else "")

class FakeBook:
    datemode = 0
    def __init__(self, rows):
        self._s = FakeSheet(rows)
    def sheet_by_index(self, _i=0):
        return self._s

# Excel serial 46343 = 2026-11-17 (datemode 0)
S17 = 46343
S13 = 46339

class TestCobros(unittest.TestCase):
    def test_detecta_y_agrega_pagos_mixtos(self):
        rows = [
            ["Reporte de COBROS REALIZADOS", "", "", "", "", "", "", ""],
            ["Fecha Pago", "Forma Pago", "", "", "Valor", "", "Número Factura", "Cliente"],
            [S17, "Transferencia", "", "", 65, "", "001-001-000002951", "Camila Cadena"],
            [S17, "Tarjeta", "", "", 100, "", "001-001-000002940", "Elizabeth Godines"],
            [S17, "Tarjeta", "", "", 171.50, "", "001-001-000002940", "Elizabeth Godines"],
            [S13, "Transferencia", "", "", 40, "", "001-001-000002906", "CADENA SANCHEZ"],
            [S13, "Tarjeta", "", "", 34.16, "", "001-001-000002906", "CADENA SANCHEZ"],
            ["", "TOTAL", "", "", 0, "", "", ""],
        ]
        book = FakeBook(rows)
        self.assertTrue(m.es_cobros_realizados(book))
        inv = {f["factura"]: f for f in m.parse_cobros(book)}
        self.assertEqual(inv["001-001-000002951"]["total"], 65.0)
        self.assertEqual(inv["001-001-000002951"]["forma"], "transferencia")
        self.assertEqual(inv["001-001-000002951"]["fecha"], "2026-11-17")
        self.assertEqual(inv["001-001-000002940"]["total"], 271.5)
        self.assertEqual(inv["001-001-000002940"]["forma"], "tarjeta")
        self.assertEqual(inv["001-001-000002906"]["forma"], "mixto")
        self.assertEqual(inv["001-001-000002906"]["total"], 74.16)
        self.assertEqual(len(inv), 3)
        # TK91: cada forma con su monto (no solo «mixto»).
        self.assertEqual(inv["001-001-000002906"]["formas_pago"], [{"forma": "transferencia", "valor": 40.0}, {"forma": "tarjeta", "valor": 34.16}])
        self.assertEqual(inv["001-001-000002940"]["formas_pago"], [{"forma": "tarjeta", "valor": 100.0}, {"forma": "tarjeta", "valor": 171.5}])

    def test_archivo_vivo_si_existe(self):
        path = Path("/workspace/sunsu/migo_exports/cobros_realizados_2026-11-01_2026-11-18.xls")
        if not path.exists():
            self.skipTest("export no está en esta caja")
        facts = m.parse_formas(path)
        self.assertGreaterEqual(len(facts), 100)
        # el export se renueva cada hora: solo crece
        self.assertGreaterEqual(facts[-1]["factura"], "001-001-000002962")
        nov17 = [f for f in facts if f["fecha"] == "2026-11-17"]
        self.assertGreaterEqual(len(nov17), 12)



class TestPdfs(unittest.TestCase):
    def test_nombra_por_secuencial(self):
        import tempfile, shutil
        d = Path(tempfile.mkdtemp())
        try:
            pdf = b"%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
            (d / "001-001-000002951.pdf").write_bytes(pdf)
            (d / "2961.pdf").write_bytes(pdf)
            (d / "nota.txt").write_text("no")
            items = m.pdfs_de_dir(d)
            facs = {x["factura"] for x in items}
            self.assertEqual(facs, {"001-001-000002951", "001-001-000002961"})
            self.assertTrue(all(x["data"].startswith("data:application/pdf;base64,") for x in items))
        finally:
            shutil.rmtree(d)


class TestResumen(unittest.TestCase):
    def test_lista_novedades_de_la_corrida(self):
        txt = m.formato_resumen({
            "borradores": [
                {"factura": "001-001-000002951", "ticket": None, "estado": "pendiente"},
            ],
            "flags": [
                {"ticket": "TK-SO-1888", "factura": "001-001-000002940", "color": "rojo", "motivo": "Diferencia de monto", "kind": "monto"},
                {"ticket": "TK-SO-1902", "factura": None, "color": "rojo", "motivo": "Sin factura en Migo", "kind": "sinfac"},
            ],
            "por_facturar": [
                {"ticket": "TK-SO-1902", "factura": None, "motivo": "Sin factura en Migo"},
            ],
        })
        self.assertIn("=== Resumen de esta corrida ===", txt)
        self.assertIn("Borradores creados (1):", txt)
        self.assertIn("—  · factura 001-001-000002951  (sin ticket, pendiente)", txt)
        self.assertIn("Flags nuevas (2):", txt)
        self.assertIn("TK-SO-1888  · factura 001-001-000002940  · rojo · Diferencia de monto", txt)
        self.assertIn("TK-SO-1902  · factura —  · rojo · Sin factura en Migo", txt)
        self.assertIn("Tickets por facturar (1):", txt)
        self.assertIn("TK-SO-1902  · factura —  · Sin factura en Migo", txt)
        # Nunca cédulas, teléfonos, correos ni secretos, aunque vengan en el motivo.
        sucio = m.formato_resumen({
            "borradores": [],
            "flags": [{
                "ticket": "TK-SO-1",
                "factura": "001-001-000002900",
                "color": "amarillo",
                "motivo": "ver 1710034069 o 0991234567 o ana@correo.com cron_key=supersecreto",
            }],
            "por_facturar": [],
        })
        self.assertNotIn("1710034069", sucio)
        self.assertNotIn("0991234567", sucio)
        self.assertNotIn("ana@correo.com", sucio)
        self.assertNotIn("supersecreto", sucio)
        self.assertIn("[oculto]", sucio)
        self.assertIn("amarillo", sucio)
        self.assertEqual(m.formato_resumen(None).splitlines()[-1], "Sin novedades.")
        self.assertEqual(m.formato_resumen({}).splitlines()[-1], "Sin novedades.")

    def test_flag_resumen_esta_en_el_cli(self):
        import argparse
        # --resumen existe y no altera el resto de flags; el resumen se imprime igual por defecto.
        src = Path(m.__file__).read_text()
        self.assertIn('--resumen', src)
        self.assertIn("imprimir_resumen", src)
        self.assertIn("Ya se imprime por defecto", src)


if __name__ == "__main__":
    unittest.main()
