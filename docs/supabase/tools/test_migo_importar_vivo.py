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

    def test_archivo_vivo_si_existe(self):
        path = Path("/workspace/sunsu/migo_exports/cobros_realizados_2026-11-01_2026-11-18.xls")
        if not path.exists():
            self.skipTest("export no está en esta caja")
        facts = m.parse_formas(path)
        self.assertGreaterEqual(len(facts), 100)
        self.assertEqual(facts[-1]["factura"], "001-001-000002962")
        self.assertAlmostEqual(sum(f["total"] for f in facts), 12798.02, places=2)
        nov17 = [f for f in facts if f["fecha"] == "2026-11-17"]
        self.assertEqual(len(nov17), 12)



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

if __name__ == "__main__":
    unittest.main()
