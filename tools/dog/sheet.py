"""Contact sheet: python3 tools/dog/sheet.py out.png cols size img1 img2 ... (crops the middle of each frame)."""
import sys
from PIL import Image, ImageDraw
out, cols, size, *files = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), *sys.argv[4:]
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * size, rows * size), "white")
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB")
    w, h = im.size
    c = im.crop((int(w * 0.08), int(h * 0.18), int(w * 0.92), int(h * 0.86))).resize((size, size))
    ImageDraw.Draw(c).text((6, 4), f.split("/")[-1].replace(".png", ""), fill=(0, 0, 0))
    sheet.paste(c, ((i % cols) * size, (i // cols) * size))
sheet.save(out)
