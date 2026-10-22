"""Generate synthetic declarations pages for Rate Check verification.

The .png.b64 copies next to them are the same images base64-encoded, so a
live end-to-end scan can be driven from SQL (pg_net fetches the text from the
repository and posts it to the rate-check function). Regenerate them with:
    base64 -w0 state_farm_auto_6mo.png > state_farm_auto_6mo.png.b64

Fake names/addresses/policy numbers only. Run:
  python3 -I supabase/functions/rate-check/fixtures/generate.py
Writes state_farm_auto_6mo.png and progressive_home_12mo.png next to this file.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1275, 1650  # 8.5x11 @ 150dpi


def font(size, bold=False):
    names = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"]
    for d in ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu"]:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def page(header_color, carrier, title):
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 120], fill=header_color)
    d.text((60, 30), carrier, font=font(48, True), fill="white")
    d.text((60, 140), title, font=font(30, True), fill="black")
    d.line([60, 190, W - 60, 190], fill="black", width=2)
    return img, d


def rows(d, y, items, x1=60, x2=560, size=22):
    f, fb = font(size), font(size, True)
    for k, v in items:
        d.text((x1, y), k, font=fb, fill="black")
        d.text((x2, y), v, font=f, fill="black")
        y += size + 14
    return y


def section(d, y, label):
    d.rectangle([60, y, W - 60, y + 38], fill=(230, 230, 230))
    d.text((70, y + 6), label, font=font(24, True), fill="black")
    return y + 52


_VIN_VALUES = dict(zip("ABCDEFGHJKLMNPRSTUVWXYZ", [1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4, 5, 7, 9, 2, 3, 4, 5, 6, 7, 8, 9]))
_VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]


def with_check_digit(vin):
    """Return the 17-char VIN with a correct position-9 check digit (fake but well-formed)."""
    total = sum((int(c) if c.isdigit() else _VIN_VALUES[c]) * w for c, w in zip(vin, _VIN_WEIGHTS))
    r = total % 11
    return vin[:8] + ("X" if r == 10 else str(r)) + vin[9:]


def state_farm_auto():
    img, d = page((200, 16, 46), "State Farm", "AUTO POLICY DECLARATIONS")
    y = rows(d, 210, [
        ("Named Insured:", "Keisha T. Example"),
        ("Mailing Address:", "123 Sample Pine Dr, Lawrenceville, GA 30044"),
        ("Policy Number:", "123 4567-B12-11X"),
        ("Policy Period:", "06/01/2026 to 12/01/2026  (6 Months)"),
        ("Agent:", "Jordan Placeholder, Lawrenceville GA"),
    ])
    y = section(d, y + 10, "VEHICLES")
    y = rows(d, y, [
        ("Veh 1:", f"2021 Honda CR-V EX     VIN {with_check_digit('7FARW2H50ME004821')}"),
        ("Veh 2:", f"2018 Toyota Camry SE   VIN {with_check_digit('4T1B11HK0JU609137')}"),
    ], x2=200)
    y = section(d, y + 10, "DRIVERS")
    y = rows(d, y, [("Driver 1:", "Keisha T. Example"), ("Driver 2:", "Marcus L. Example")], x2=230)
    y = section(d, y + 10, "COVERAGES (both vehicles)")
    y = rows(d, y, [
        ("Bodily Injury Liability", "$100,000 each person / $300,000 each accident"),
        ("Property Damage Liability", "$100,000 each accident"),
        ("Uninsured Motor Vehicle", "$100,000 / $300,000"),
        ("Medical Payments", "$5,000 each person"),
        ("Comprehensive", "$500 deductible"),
        ("Collision", "$500 deductible"),
        ("Car Rental & Travel Exp.", "$40/day, $1,200 max"),
        ("Emergency Road Service", "Included"),
    ], x2=520)
    y = section(d, y + 10, "DISCOUNTS")
    y = rows(d, y, [("Applied:", "Multiple Vehicle, Drive Safe & Save, Good Driving")], x2=200)
    y = section(d, y + 10, "PREMIUM")
    rows(d, y, [
        ("Vehicle 1 premium", "$412.00"),
        ("Vehicle 2 premium", "$368.00"),
        ("TOTAL 6-MONTH POLICY PREMIUM", "$780.00"),
    ], x2=760, size=26)
    d.text((60, H - 70), "This is a SAMPLE document generated for software testing. Not a real policy.",
           font=font(18), fill=(120, 120, 120))
    img.save(os.path.join(HERE, "state_farm_auto_6mo.png"), optimize=True)


def progressive_home():
    img, d = page((0, 82, 155), "PROGRESSIVE  Home", "HOMEOWNERS POLICY DECLARATIONS PAGE")
    y = rows(d, 210, [
        ("Named Insured:", "Daniel R. Sampleton"),
        ("Insured Location:", "456 Testwood Ct, Snellville, GA 30078"),
        ("Policy Number:", "HO3-55519284"),
        ("Policy Period:", "03/15/2026 to 03/15/2027  (12 months)"),
        ("Form:", "HO-3 Special Form, Replacement Cost"),
    ])
    y = section(d, y + 10, "SECTION I - PROPERTY COVERAGES")
    y = rows(d, y, [
        ("Coverage A - Dwelling", "$385,000"),
        ("Coverage B - Other Structures", "$38,500"),
        ("Coverage C - Personal Property", "$192,500"),
        ("Coverage D - Loss of Use", "$77,000"),
    ], x2=640)
    y = section(d, y + 10, "SECTION II - LIABILITY COVERAGES")
    y = rows(d, y, [
        ("Coverage E - Personal Liability", "$300,000 each occurrence"),
        ("Coverage F - Medical Payments", "$5,000 each person"),
    ], x2=640)
    y = section(d, y + 10, "DEDUCTIBLES")
    y = rows(d, y, [
        ("All Other Perils", "$1,000"),
        ("Windstorm or Hail", "1% of Coverage A ($3,850)"),
    ], x2=640)
    y = section(d, y + 10, "DISCOUNTS")
    y = rows(d, y, [("Applied:", "Multi-Policy, Paperless, Protective Devices")], x2=200)
    y = section(d, y + 10, "PREMIUM SUMMARY")
    rows(d, y, [
        ("Base premium", "$1,968.00"),
        ("Policy fee", "$45.00"),
        ("TOTAL ANNUAL PREMIUM", "$2,013.00"),
    ], x2=760, size=26)
    d.text((60, H - 70), "This is a SAMPLE document generated for software testing. Not a real policy.",
           font=font(18), fill=(120, 120, 120))
    img.save(os.path.join(HERE, "progressive_home_12mo.png"), optimize=True)


def compact(name):
    """Downsample to a 4-level grayscale palette PNG (~18 KB) so the fixture is
    cheap to post as base64 while staying legible, like a phone photo would be."""
    path = os.path.join(HERE, name)
    im = Image.open(path).convert("L").resize((850, 1100), Image.LANCZOS)
    im = im.point(lambda p: 0 if p < 90 else (110 if p < 170 else (200 if p < 235 else 255)))
    # 8-bit grayscale: small, and a format Claude's image input accepts (it rejects
    # 2-bit palette PNGs with "Could not process image").
    im.save(path, optimize=True)


if __name__ == "__main__":
    state_farm_auto()
    progressive_home()
    compact("state_farm_auto_6mo.png")
    compact("progressive_home_12mo.png")
