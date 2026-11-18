#!/usr/bin/env python3
"""Import de solo lectura de facturas Migo hacia la beta (migo_importar).

Qué hace
  Lee el Excel «Ventas — Formas de pago» (el mismo reporte que se usó en el
  cuadre de noviembre) y, si se pasa, el de «Ventas — Detalle» para los ítems.
  POST JSON a la edge function `api` (acción migo_importar). NUNCA entra a
  emitir, anular, ni a Cerrar Caja.

Qué NO hace (y no se puede inventar en headless)
  sistema.migo.com.ec es un WebForms ASP.NET. «Exportar a Excel» es un postback
  que necesita cookie de sesión y __VIEWSTATE. curl no es fiable; la edge
  function no puede abrir un navegador.

  Para que el cruce sea horario de verdad hace falta un trabajo EN UNA CAJA
  (Playwright o un navegador ya logueado), no en la función:

  1. Entrar a https://sistema.migo.com.ec SOLO con el login de la bóveda
     5135118 (nunca 5134734). No pulsar Cerrar Caja. No emitir ni anular.
  2. Ir al reporte Ventas → Formas de pago, rango desde 2026-11-01 (o el
     mes en curso) hasta hoy, Exportar a Excel. Opcional: el Detalle del
     mismo rango, para prefijar ítems en los borradores.
  3. Guardar los .xls y correr este script (o un cron en esa caja, en
     minutos :20–:50, nunca :00–:15 de merge/deploy):

       python3 docs/supabase/tools/migo_importar_vivo.py \\
         --xls /ruta/migo_ventas_formas_pago.xls \\
         --detalle /ruta/migo_ventas_detalle.xls \\
         --cron-key-file /ruta/secreto_migo_cron

     El script no imprime la clave ni cédulas/teléfonos.

  Si Emilia prefiere no dejar un navegador abierto, basta con exportar el
  Excel a mano y correr el script; el cruce (migo_cuadre_hora) también se
  puede llamar con la misma clave sobre datos ya importados.
"""
from __future__ import annotations

import argparse, json, os, re, ssl, sys, urllib.request
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

try:
    import xlrd
except ImportError:
    sys.stderr.write("Falta xlrd. instala: pip install xlrd\n")
    raise

URL_DEFAULT = "https://heuolwxyxoezkewyufrl.supabase.co/functions/v1/api"
# No leer columnas de identificación (RUC/cédula/teléfono).

def money(v) -> float:
    if v in (None, ""):
        return 0.0
    if isinstance(v, (int, float)):
        d = Decimal(str(v))
    else:
        d = Decimal(re.sub(r"[^\d.\-]", "", str(v) or "0") or "0")
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def fac_norm(raw) -> str | None:
    t = str(raw or "").strip()
    if not t:
        return None
    m = re.search(r"(\d{3})-(\d{3})-(\d{1,9})", t)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{int(m.group(3)):09d}"
    s2 = t.replace(",", "")
    if re.fullmatch(r"\d+(?:\.0+)?", s2):
        return f"001-001-{int(s2.split('.')[0]):09d}"
    d = re.search(r"(\d{3,})", s2)
    return f"001-001-{int(d.group(1)):09d}" if d else None

def parse_dt(book, v):
    if v in (None, ""):
        return None
    if isinstance(v, (int, float)):
        try:
            return xlrd.xldate_as_datetime(v, book.datemode)
        except Exception:
            return None
    t = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            from datetime import datetime
            return datetime.strptime(t[:10], fmt)
        except ValueError:
            continue
    return None

def forma_migo(raw) -> str:
    t = str(raw or "").strip()
    u = t.lower()
    if re.search(r"tarj|credito|crédito|debito|débito|visa|master", u):
        return "tarjeta"
    if re.search(r"trans|depo|transf|pichincha|produbanco|guayaquil", u):
        return "transferencia"
    if re.search(r"efec|cash", u):
        return "efectivo"
    return t

def parse_formas(path: Path) -> list[dict]:
    book = xlrd.open_workbook(str(path))
    s = book.sheet_by_index(0)
    inv = {}
    for r in range(s.nrows):
        row = [s.cell(r, c).value if c < s.ncols else None for c in range(max(s.ncols, 18))]
        typ, num = row[2], row[3]
        fac = fac_norm(num) if typ not in (None, "") else None
        # filas de factura: tipo + número tipo 001-001-…
        if not fac:
            continue
        if str(typ or "").strip().upper().startswith("TOTAL"):
            continue
        emision = parse_dt(book, row[0])
        if not emision:
            continue
        cur = inv.get(fac) or {
            "factura": fac,
            "fecha": emision.date().isoformat(),
            "hora": emision.strftime("%H:%M:%S") if hasattr(emision, "strftime") else "",
            "cliente": str(row[4] or "").strip(),
            "subtotal": money(row[6]),
            "descuento": money(row[7]),
            "iva": money(row[8]),
            "total": money(row[9]),
            "forma": forma_migo(row[12]),
            "lineas": [],
        }
        # pagos mixtos: conservar la primera forma; no pisa el total
        if not cur.get("cliente"):
            cur["cliente"] = str(row[4] or "").strip()
        inv[fac] = cur
    return [inv[k] for k in sorted(inv)]

def parse_detalle(path: Path, facturas: list[dict]) -> None:
    by = {f["factura"]: f for f in facturas}
    book = xlrd.open_workbook(str(path))
    s = book.sheet_by_index(0)
    for r in range(3, s.nrows):
        num = fac_norm(s.cell(r, 3).value)
        if not num:
            continue
        # No leer cols 6 u 8 (tipo/número de identificación).
        producto = str(s.cell(r, 12).value or "").strip()
        codigo = str(s.cell(r, 11).value or "").strip()
        if not producto and not codigo:
            continue
        f = by.get(num)
        if not f:
            continue
        f.setdefault("lineas", []).append({
            "codigo": codigo,
            "producto": producto,
            "cantidad": money(s.cell(r, 14).value) or 1,
            "precio_unit": money(s.cell(r, 13).value),
            "subtotal": money(s.cell(r, 15).value),
            "iva": money(s.cell(r, 16).value),
            "total": money(s.cell(r, 17).value),
        })

def post_import(url: str, payload: dict, token: str | None, cron_key: str | None) -> dict:
    body = dict(payload)
    body["accion"] = "migo_importar"
    if token:
        body["token"] = token
    if cron_key:
        body["cron_key"] = cron_key
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "User-Agent": "sunsu-migo-import"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=120) as res:
        raw = res.read().decode()
    return json.loads(raw) if raw else {}

def read_secret_file(p: str | None) -> str | None:
    if not p:
        return None
    return Path(p).read_text().strip() or None

def main():
    ap = argparse.ArgumentParser(description="Importa el Excel de Migo (solo lectura) a la beta.")
    ap.add_argument("--xls", required=True, help="Ventas formas de pago (.xls)")
    ap.add_argument("--detalle", help="Ventas detalle (.xls), opcional para ítems de borrador")
    ap.add_argument("--url", default=os.environ.get("SUNSU_API_URL", URL_DEFAULT))
    ap.add_argument("--token-file", help="Archivo con token de sesión admin (no imprimir)")
    ap.add_argument("--cron-key-file", help="Archivo con MIGO_CRON_KEY (no imprimir)")
    ap.add_argument("--fuente", default="xls")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    facturas = parse_formas(Path(args.xls))
    if args.detalle:
        parse_detalle(Path(args.detalle), facturas)
    fechas = [f["fecha"] for f in facturas]
    # Resumen sin nombres si se pide dry-run? nombres sí se pueden listar; no cédulas.
    print(f"Facturas leídas: {len(facturas)}" + (f"  {fechas[0]} → {fechas[-1]}" if fechas else ""))
    if facturas:
        print(f"Secuenciales: {facturas[0]['factura']} … {facturas[-1]['factura']}")
        con_lineas = sum(1 for f in facturas if f.get("lineas"))
        if args.detalle:
            print(f"Con ítems de detalle: {con_lineas}")
    payload = {
        "fecha_desde": fechas[0] if fechas else None,
        "fecha_hasta": fechas[-1] if fechas else None,
        "fuente": args.fuente,
        "facturas": facturas,
    }
    if args.dry_run:
        print("Dry-run: no se envió nada.")
        return
    token = read_secret_file(args.token_file)
    cron = read_secret_file(args.cron_key_file)
    if not token and not cron:
        sys.stderr.write("Falta --token-file o --cron-key-file\n")
        sys.exit(2)
    out = post_import(args.url, payload, token, cron)
    # No volcar el payload ni secretos.
    if not out.get("ok"):
        sys.stderr.write("Error: " + str(out.get("error") or out) + "\n")
        sys.exit(1)
    cuadre = out.get("cuadre") or {}
    print(
        "Import ok:",
        out.get("importadas"),
        "facturas,",
        "+" + str(out.get("nuevas")),
        "nuevas, máx",
        out.get("max_seq"),
        "| links",
        cuadre.get("links"),
        "flags abiertas",
        cuadre.get("flags_abiertas"),
        "borradores nuevos",
        cuadre.get("borradores_nuevos"),
    )

if __name__ == "__main__":
    main()
