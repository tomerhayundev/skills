"""Frame sheets: drop near-duplicate consecutive frames, then tile the rest 3 across, 4 down, with timestamps.
    python sheets.py <frames folder> <sheets folder> [--step N]
Frame files are named by their second (00034.jpg), or, with --step, numbered from 1 as ffmpeg writes them
(fps=1/N), so frame n is at (n - 1) * N seconds."""
import sys, os
from PIL import Image, ImageDraw, ImageChops, ImageStat

args = [a for a in sys.argv[1:] if not a.startswith('--')]
step = next((int(a.split('=')[1]) for a in sys.argv[1:] if a.startswith('--step=')), None)
if '--step' in sys.argv:
    step = int(sys.argv[sys.argv.index('--step') + 1])
    args = [a for a in args if a != str(step)]
src, out = args[0], args[1]
os.makedirs(out, exist_ok=True)
files = sorted(f for f in os.listdir(src) if f.endswith('.jpg'))
keep, last = [], None
for f in files:
    im = Image.open(os.path.join(src, f)).convert('RGB')
    small = im.resize((64, 36)).convert('L')
    if last is not None:
        diff = ImageStat.Stat(ImageChops.difference(small, last)).mean[0]
        if diff < 6:
            continue
    keep.append((f, im))
    last = small
W, H, cols, rows = 560, 315, 3, 4
per = cols * rows
for i in range(0, len(keep), per):
    sheet = Image.new('RGB', (cols * W, rows * (H + 18)), 'white')
    d = ImageDraw.Draw(sheet)
    for j, (f, im) in enumerate(keep[i:i + per]):
        x, y = (j % cols) * W, (j // cols) * (H + 18)
        sheet.paste(im.resize((W, H)), (x, y + 18))
        t = (int(f[:-4]) - 1) * step if step else int(f[:-4])
        d.text((x + 4, y + 3), f'{t // 60}:{t % 60:02d}', fill='black')
    sheet.save(os.path.join(out, f'sheet-{i // per + 1:02d}.jpg'), quality=85)
print(f'{len(files)} frames, {len(keep)} kept, {(len(keep) + per - 1) // per} sheets')
