#!/usr/bin/env python3
"""Import de solo lectura de facturas Migo hacia la beta (migo_importar).

Qué hace
  Lee el Excel de «Ventas → Cobros Realizados» (el reporte horario: Fecha Pago,
  Forma Pago, Valor, Número Factura, Cliente). Si el archivo es el viejo
  «Ventas → Formas de pago», también lo entiende. Opcional: «Ventas → Ventas Detalladas» (REPORTE DETALLADO DE VENTAS, --detalle)
  para ítems de borrador (Cobros Realizados no trae ítems). Solo filas Tipo=Factura.
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
  2. Ir al reporte Ventas → Cobros Realizados, rango desde 2026-11-01 (o el
     mes en curso) hasta hoy, Exportar a Excel. El Detalle es opcional y no
     viene en este reporte; si existe un Excel de Detalle, se puede pasar
     igual para prefijar ítems en los borradores.
  3. Guardar el .xls y correr este script (o un cron en esa caja, en
     minutos :20–:55, nunca :00–:15 de merge/deploy):

       python3 docs/supabase/tools/migo_importar_vivo.py \
         --xls /ruta/cobros_realizados.xls \
         --cron-key-file /ruta/secreto_migo_cron

     El script no imprime la clave ni cédulas/teléfonos.

  Desde el 18-nov-2026 11:30 (America/Guayaquil) el trabajo horario lo corre
  el bot CUADRE, invocando este mismo CLI. Los flags se mantienen estables;
  ver python3 docs/supabase/tools/migo_importar_vivo.py --help.

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

def _norm_header(v) -> str:
    t = str(v or "").strip().lower()
    t = t.replace("ú", "u").replace("ó", "o").replace("á", "a").replace("é", "e").replace("í", "i")
    return " ".join(t.split())

def es_cobros_realizados(book) -> bool:
    s = book.sheet_by_index(0)
    blob = " ".join(_norm_header(s.cell(r, c).value) for r in range(min(8, s.nrows)) for c in range(s.ncols))
    return "cobros realizados" in blob or ("forma pago" in blob and "numero factura" in blob and "fecha pago" in blob)

def _mapa_encabezado(s, fila: int) -> dict[str, int]:
    m: dict[str, int] = {}
    alias = {
        "fecha pago": "fecha", "fecha": "fecha", "fecha emision": "fecha", "emision": "fecha",
        "forma pago": "forma", "forma de pago": "forma",
        "valor": "valor", "total": "total", "total pagar": "total",
        "numero factura": "factura", "factura": "factura", "nro factura": "factura",
        "cliente": "cliente",
        "subtotal": "subtotal", "descuento": "descuento", "iva": "iva",
    }
    for c in range(s.ncols):
        k = alias.get(_norm_header(s.cell(fila, c).value))
        if k and k not in m:
            m[k] = c
    return m

def parse_cobros(book) -> list[dict]:
    """Ventas → Cobros Realizados: una o varias filas de pago por factura."""
    s = book.sheet_by_index(0)
    head = None
    for r in range(min(12, s.nrows)):
        m = _mapa_encabezado(s, r)
        if "factura" in m and "forma" in m and ("valor" in m or "total" in m):
            head = (r, m)
            break
    if not head:
        return []
    _, cols = head
    inv: dict[str, dict] = {}
    for r in range(s.nrows):
        raw_fac = s.cell(r, cols["factura"]).value if cols["factura"] < s.ncols else ""
        raw_forma = s.cell(r, cols["forma"]).value if cols["forma"] < s.ncols else ""
        if str(raw_forma or "").strip().upper().startswith("TOTAL"):
            continue
        fac = fac_norm(raw_fac)
        if not fac:
            continue
        fe = parse_dt(book, s.cell(r, cols["fecha"]).value) if "fecha" in cols else None
        if not fe:
            continue
        monto_col = cols.get("valor", cols.get("total"))
        monto = money(s.cell(r, monto_col).value) if monto_col is not None else 0.0
        forma = forma_migo(raw_forma)
        cliente = str(s.cell(r, cols["cliente"]).value or "").strip() if "cliente" in cols else ""
        cur = inv.get(fac)
        if not cur:
            inv[fac] = {
                "factura": fac,
                "fecha": fe.date().isoformat(),
                "hora": fe.strftime("%H:%M:%S") if hasattr(fe, "hour") and (fe.hour or fe.minute or fe.second) else "",
                "cliente": cliente,
                "subtotal": 0.0,
                "descuento": 0.0,
                "iva": 0.0,
                "total": monto,
                "forma": forma,
                "lineas": [],
                "_formas": [forma] if forma else [],
                # TK91 (Emilia 18/11): cada fila de cobro con su forma y monto (pago mixto: efectivo + transferencia + tarjeta).
                "formas_pago": [{"forma": forma or str(raw_forma or "").strip(), "valor": monto}] if monto else [],
            }
            continue
        if monto:
            cur.setdefault("formas_pago", []).append({"forma": forma or str(raw_forma or "").strip(), "valor": monto})
        cur["total"] = money(cur["total"] + monto)
        if cliente and not cur.get("cliente"):
            cur["cliente"] = cliente
        if forma:
            cur.setdefault("_formas", [])
            if forma not in cur["_formas"]:
                cur["_formas"].append(forma)
            cur["forma"] = cur["_formas"][0] if len(cur["_formas"]) == 1 else "mixto"
        if fe.date().isoformat() < cur["fecha"]:
            cur["fecha"] = fe.date().isoformat()
    out = []
    for k in sorted(inv):
        cur = inv[k]
        cur.pop("_formas", None)
        out.append(cur)
    return out

def parse_formas_pago(book) -> list[dict]:
    """Formato anterior: Ventas → Formas de pago (tipo + número en cols 2-3)."""
    s = book.sheet_by_index(0)
    inv = {}
    for r in range(s.nrows):
        row = [s.cell(r, c).value if c < s.ncols else None for c in range(max(s.ncols, 18))]
        typ, num = row[2], row[3]
        fac = fac_norm(num) if typ not in (None, "") else None
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
        if not cur.get("cliente"):
            cur["cliente"] = str(row[4] or "").strip()
        inv[fac] = cur
    return [inv[k] for k in sorted(inv)]

def parse_formas(path: Path) -> list[dict]:
    book = xlrd.open_workbook(str(path))
    if es_cobros_realizados(book):
        return parse_cobros(book)
    return parse_formas_pago(book)

def _mapa_detalle(s, fila: int) -> dict[str, int]:
    """Encabezados de «REPORTE DETALLADO DE VENTAS» (Ventas → Ventas Detalladas).
    Hay columnas vacías de relleno; no se leen identificación (cédula/RUC)."""
    alias = {
        "fecha": "fecha", "tipo": "tipo",
        "num. factura": "factura", "num factura": "factura", "numero factura": "factura",
        "nro factura": "factura", "factura": "factura",
        "cliente": "cliente",
        "cod. producto": "codigo", "cod producto": "codigo", "codigo producto": "codigo",
        "codigo": "codigo", "sku": "codigo",
        "producto": "producto", "descripcion": "producto",
        "precio unitario": "precio_unit", "precio unit": "precio_unit", "p. unitario": "precio_unit",
        "cantidad": "cantidad", "cant.": "cantidad", "cant": "cantidad",
        "subtotal": "subtotal", "iva": "iva", "total": "total",
        "promocion": "promo", "observacion detalle": "obs",
    }
    m: dict[str, int] = {}
    for c in range(s.ncols):
        k = alias.get(_norm_header(s.cell(fila, c).value))
        if k and k not in m:
            m[k] = c
    return m

def parse_detalle(path: Path, facturas: list[dict]) -> None:
    """Adjunta ítems (Tipo=Factura) a las facturas ya leídas de Cobros Realizados.
    Precio unitario y subtotal vienen sin IVA; Total es con IVA. Sin columna Descuento:
    se estima como precio_unit*cantidad − subtotal cuando hay diferencia (p. ej. promo).
    """
    by = {f["factura"]: f for f in facturas}
    book = xlrd.open_workbook(str(path))
    s = book.sheet_by_index(0)
    head = None
    for r in range(min(12, s.nrows)):
        m = _mapa_detalle(s, r)
        if "factura" in m and ("codigo" in m or "producto" in m) and ("total" in m or "subtotal" in m):
            head = (r, m)
            break
    if not head:
        return
    start, cols = head
    tiene_tipo = "tipo" in cols
    for r in range(start + 1, s.nrows):
        if tiene_tipo:
            typ = str(s.cell(r, cols["tipo"]).value or "").strip().lower()
            if typ and typ != "factura":
                continue
        num = fac_norm(s.cell(r, cols["factura"]).value)
        if not num:
            continue
        codigo = str(s.cell(r, cols["codigo"]).value or "").strip() if "codigo" in cols else ""
        producto = str(s.cell(r, cols["producto"]).value or "").strip() if "producto" in cols else ""
        if not producto and not codigo:
            continue
        f = by.get(num)
        if not f:
            continue
        qty = money(s.cell(r, cols["cantidad"]).value) if "cantidad" in cols else 1
        if not qty:
            qty = 1
        unit = money(s.cell(r, cols["precio_unit"]).value) if "precio_unit" in cols else 0.0
        sub = money(s.cell(r, cols["subtotal"]).value) if "subtotal" in cols else money(unit * qty)
        iva = money(s.cell(r, cols["iva"]).value) if "iva" in cols else 0.0
        tot = money(s.cell(r, cols["total"]).value) if "total" in cols else money(sub + iva)
        desc = money(unit * qty - sub) if unit and qty and sub else 0.0
        if desc < 0:
            desc = 0.0
        f.setdefault("lineas", []).append({
            "codigo": codigo,
            "sku": codigo,
            "producto": producto,
            "cantidad": qty,
            "precio_unit": unit,
            "descuento": desc,
            "subtotal": sub,
            "iva": iva,
            "total": tot,
        })
        if sub and not f.get("subtotal"):
            f["subtotal"] = 0.0
        if sub:
            f["subtotal"] = money((f.get("subtotal") or 0) + sub)
        if iva:
            f["iva"] = money((f.get("iva") or 0) + iva)


def pdfs_de_dir(folder: Path) -> list[dict]:
    """Lee PDFs nombrados por número de factura (001-001-000002951.pdf o 2951.pdf)."""
    import base64
    if not folder.is_dir():
        return []
    out = []
    for path in sorted(folder.glob("*.pdf")):
        fac = fac_norm(path.stem.split("_")[0])
        if not fac:
            continue
        raw = path.read_bytes()
        if not raw.startswith(b"%PDF"):
            continue
        out.append({
            "factura": fac,
            "nombre": path.name,
            "data": "data:application/pdf;base64," + base64.b64encode(raw).decode("ascii"),
        })
    return out


def cliente_de_ride(texto: str) -> dict:
    """TK132: datos de la clienta del RIDE (solo lectura): RUC/CI, e-mail, teléfono (+593) y dirección.
    Nunca se imprimen."""
    t = texto or ""
    out: dict = {}
    m = re.search(r"RUC\s*/\s*CI\s*:\s*([0-9A-Z-]{5,20})", t)
    if m:
        if not re.fullmatch(r"9{10,13}", m.group(1).strip()):  # consumidor final
            out["ruc"] = m.group(1).strip()
    m = re.search(r"E-?MAIL\s*:\s*([\w.+-]+@[\w.-]+\.\w+)", t, re.I)
    if m:
        out["email"] = m.group(1).strip().lower()
    m = re.search(r"Tel[eé]fono\s*:\s*(\+?[\d\s()-]{7,20})", t, re.I)
    if m:
        out["telefono"] = telefono_ec(m.group(1))
    m = re.search(r"Direcci[oó]n\s*:\s*([^\n]+?)(?:\s{2,}|\n|$)", t)
    if m and m.group(1).strip() not in ("", "-"):
        out["direccion"] = m.group(1).strip()[:200]
    return {k: v for k, v in out.items() if v}

def telefono_ec(v: str) -> str:
    d = re.sub(r"\D", "", v or "")
    if d.startswith("593"):
        d = d[3:]
    d = d.lstrip("0")
    return ("+593" + d) if len(d) in (8, 9) else ""

def clientes_de_pdfs(folder: Path) -> list[dict]:
    import subprocess
    out = []
    if not folder.is_dir():
        return out
    for path in sorted(folder.glob("*.pdf")):
        fac = fac_norm(path.stem.split("_")[0])
        if not fac:
            continue
        try:
            txt = subprocess.run(["pdftotext", "-layout", str(path), "-"], capture_output=True, text=True, timeout=30).stdout
        except Exception:
            continue
        c = cliente_de_ride(txt)
        if c:
            out.append({"factura": fac, **c})
    return out

def post_accion(url: str, accion: str, payload: dict, token: str | None, cron_key: str | None) -> dict:
    body = dict(payload)
    body["accion"] = accion
    if token:
        body["token"] = token
    if cron_key:
        body["cron_key"] = cron_key
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json", "User-Agent": "sunsu-migo-import"})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=180) as res:
        raw = res.read().decode()
    return json.loads(raw) if raw else {}

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


# No se imprimen cédulas, teléfonos, correos ni secretos (ni en el resumen).
_RE_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.\w+\b")
_RE_PHONE = re.compile(r"\b(?:\+593\s?|0)(?:9\d{8}|[2-7]\d{7})\b")
_RE_CEDULA = re.compile(r"\b\d{10}\b")
_RE_SECRET = re.compile(r"(?i)(cron_key|token|password|secret|apikey|service_role|authorization)[=:\s]+\S+")

def texto_seguro(v: object) -> str:
    s = "" if v is None else str(v)
    s = _RE_SECRET.sub("[oculto]", s)
    s = _RE_EMAIL.sub("[oculto]", s)
    s = _RE_PHONE.sub("[oculto]", s)
    s = _RE_CEDULA.sub("[oculto]", s)
    return s

def _tk(item: dict) -> str:
    return texto_seguro(item.get("ticket") or item.get("ticket_clave") or "—")

def _fac(item: dict) -> str:
    f = item.get("factura")
    return texto_seguro(f) if f else "—"

def formato_resumen(resumen: dict | None) -> str:
    """Texto de las novedades de ESTA corrida: borradores, flags nuevas y tickets por facturar."""
    r = resumen if isinstance(resumen, dict) else {}
    borr = list(r.get("borradores") or [])
    flags = list(r.get("flags") or [])
    porf = list(r.get("por_facturar") or [])
    lines = ["=== Resumen de esta corrida ==="]
    if not (borr or flags or porf):
        lines.append("Sin novedades.")
        return "\n".join(lines)

    lines.append(f"Borradores creados ({len(borr)}):")
    if not borr:
        lines.append("  (ninguno)")
    for b in borr:
        est = texto_seguro(b.get("estado") or "pendiente")
        lines.append(f"  {_tk(b)}  · factura {_fac(b)}  (sin ticket, {est})")

    lines.append(f"Flags nuevas ({len(flags)}):")
    if not flags:
        lines.append("  (ninguna)")
    for f in flags:
        color = texto_seguro(f.get("color") or "rojo")
        motivo = texto_seguro(f.get("motivo") or f.get("kind") or "")
        extra = f"  · {color}" + (f" · {motivo}" if motivo else "")
        lines.append(f"  {_tk(f)}  · factura {_fac(f)}{extra}")

    lines.append(f"Tickets por facturar ({len(porf)}):")
    if not porf:
        lines.append("  (ninguno)")
    for t in porf:
        motivo = texto_seguro(t.get("motivo") or "")
        extra = f"  · {motivo}" if motivo else ""
        lines.append(f"  {_tk(t)}  · factura {_fac(t)}{extra}")
    return "\n".join(lines)

def imprimir_resumen(resumen: dict | None) -> None:
    print(formato_resumen(resumen))

def main():
    ap = argparse.ArgumentParser(
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="Importa el Excel de Migo (solo lectura) a la beta y dispara el cruce.",
        epilog='Reporte: Ventas → Cobros Realizados (Fecha Pago, Forma Pago, Valor,\nNúmero Factura, Cliente). El formato anterior «Formas de pago» también se acepta.\n--detalle es opcional; Cobros Realizados no trae ítems.\n\nEl trabajo horario lo corre el bot CUADRE desde el 18-nov-2026 11:30\n(America/Guayaquil). Este CLI es el que ese bot invoca: no se cambian los\nnombres ni el significado de los flags existentes (--xls, --detalle, --url,\n--token-file, --cron-key-file, --fuente, --dry-run). --pdf-dir y --resumen son\noptativos. Al final de cada corrida se imprime un resumen de novedades\n(borradores, flags rojas/amarillas y tickets por facturar: TK + factura).\n--resumen deja ese comportamiento explícito.\n\nPDFs de factura (solo lectura): dejar cada RIDE en\n/workspace/sunsu/migo_exports/pdf/001-001-000002951.pdf (también vale 2951.pdf).\n\nVentana del import/cruce: minutos :20–:55. Nunca en :00–:15 (merge/deploy).\nNo imprime la clave, cédulas ni teléfonos. No emite ni anula facturas, ni\ncierra caja. No escribe en Sheets.\n\nEjemplo:\n  python3 docs/supabase/tools/migo_importar_vivo.py \\\n    --xls /ruta/cobros_realizados.xls \\\n    --pdf-dir /workspace/sunsu/migo_exports/pdf \\\n    --cron-key-file /ruta/secreto_migo_cron\n',
    )
    ap.add_argument("--xls", help="Ventas → Cobros Realizados (.xls); también acepta Formas de pago")
    ap.add_argument("--detalle", help="Ventas → Ventas Detalladas / REPORTE DETALLADO DE VENTAS (.xls), opcional para ítems")
    ap.add_argument("--pdf-dir", help="Carpeta con RIDE PDF nombrados 001-001-000002951.pdf (o 2951.pdf)")
    ap.add_argument("--url", default=os.environ.get("SUNSU_API_URL", URL_DEFAULT), help="URL de la edge function api (SUNSU_API_URL)")
    ap.add_argument("--token-file", help="Archivo con token de sesión admin (no imprimir)")
    ap.add_argument("--cron-key-file", help="Archivo con MIGO_CRON_KEY (no imprimir)")
    ap.add_argument("--fuente", default="xls", help="Etiqueta de origen del import (por defecto: xls)")
    ap.add_argument("--dry-run", action="store_true", help="Solo parsea e imprime el conteo; no llama a la API")
    ap.add_argument("--resumen", action="store_true", help="Imprime al final las novedades de esta corrida (TK, factura, color/motivo). Ya se imprime por defecto.")
    args = ap.parse_args()

    if not args.xls and not args.pdf_dir:
        sys.stderr.write("Falta --xls o --pdf-dir\n")
        sys.exit(2)
    facturas = parse_formas(Path(args.xls)) if args.xls else []
    if args.detalle:
        if not facturas:
            sys.stderr.write("--detalle requiere --xls\n")
            sys.exit(2)
        parse_detalle(Path(args.detalle), facturas)
    pdfs = pdfs_de_dir(Path(args.pdf_dir)) if args.pdf_dir else []
    fechas = [f["fecha"] for f in facturas]
    # Resumen sin nombres si se pide dry-run? nombres sí se pueden listar; no cédulas.
    print(f"Facturas leídas: {len(facturas)}" + (f"  {fechas[0]} → {fechas[-1]}" if fechas else ""))
    if facturas:
        print(f"Secuenciales: {facturas[0]['factura']} … {facturas[-1]['factura']}")
        con_lineas = sum(1 for f in facturas if f.get("lineas"))
        if args.detalle:
            print(f"Con ítems de detalle: {con_lineas}")
    if args.pdf_dir:
        print(f"PDFs en carpeta: {len(pdfs)}")
    payload = {
        "fecha_desde": fechas[0] if fechas else None,
        "fecha_hasta": fechas[-1] if fechas else None,
        "fuente": args.fuente,
        "facturas": facturas,
    }
    if args.dry_run:
        print("Dry-run: no se envió nada.")
        print("=== Resumen de esta corrida ===")
        print("Dry-run: sin novedades de cruce (no se llamó a la API).")
        return
    token = read_secret_file(args.token_file)
    cron = read_secret_file(args.cron_key_file)
    if not token and not cron:
        sys.stderr.write("Falta --token-file o --cron-key-file\n")
        sys.exit(2)
    resumen = None
    if facturas:
        out = post_import(args.url, payload, token, cron)
        if not out.get("ok"):
            sys.stderr.write("Error: " + str(out.get("error") or out) + "\n")
            sys.exit(1)
        cuadre = out.get("cuadre") or {}
        resumen = cuadre.get("resumen") if isinstance(cuadre, dict) else None
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
    if pdfs:
        adjuntos = tickets = pendientes = omitidos = 0
        for i in range(0, len(pdfs), 6):
            lote = [{k: x[k] for k in ("factura", "nombre", "data")} for x in pdfs[i:i+6]]
            r = post_accion(args.url, "migo_adjuntar_pdfs", {"pdfs": lote}, token, cron)
            if not r.get("ok"):
                sys.stderr.write("Error PDFs: " + str(r.get("error") or r) + "\n")
                sys.exit(1)
            adjuntos += int(r.get("adjuntos") or 0)
            tickets += int(r.get("tickets") or 0)
            pendientes += int(r.get("pendientes") or 0)
            omitidos += int(r.get("omitidos") or 0)
        print("PDFs ok:", adjuntos, "adjuntos,", tickets, "tickets,", pendientes, "sin ticket,", omitidos, "omitidos")
        # TK132: cédula/RUC, correo, teléfono y dirección de la clienta del RIDE → la beta (no se imprimen).
        clis = clientes_de_pdfs(Path(args.pdf_dir))
        if clis:
            r = post_accion(args.url, "migo_clientes_ride", {"clientes": clis}, token, cron)
            if not r.get("ok"):
                sys.stderr.write("Error clientes RIDE: " + texto_seguro(r.get("error") or r) + "\n")
                sys.exit(1)
            print("Clientes RIDE ok:", r.get("actualizadas"), "facturas")
    # El resumen de novedades va al final, por defecto (también con --resumen).
    imprimir_resumen(resumen)

if __name__ == "__main__":
    main()
