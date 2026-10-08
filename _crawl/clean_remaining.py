import os, sys, io, shutil, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
import importlib.util
spec = importlib.util.spec_from_file_location("ca", os.path.join(os.path.dirname(os.path.abspath(__file__)), "clean_assets.py"))
# avoid re-running the module body: replicate just the helper
from PIL import Image, ImageDraw, ImageFilter
MARKER=(255,0,255)
def flood_mark(src, thresh):
    work=src.copy(); w,h=work.size
    pts=[(x,y) for x in (0,w//2,w-1) for y in (0,h//2,h-1)]
    for s in pts:
        if work.getpixel(s)!=MARKER: ImageDraw.floodfill(work,s,MARKER,thresh=thresh)
    for x in range(w):
        for s in ((x,0),(x,h-1)): ImageDraw.floodfill(work,s,MARKER,thresh=thresh)
    for y in range(h):
        for s in ((0,y),(w-1,y)): ImageDraw.floodfill(work,s,MARKER,thresh=thresh)
    return work
def make(path,thresh=42,fringe=2,white_cut=236):
    src=Image.open(path).convert("RGB"); w,h=src.size
    work=flood_mark(src,thresh); spx=src.load(); cpx=work.load()
    a=Image.new("L",(w,h),255); apx=a.load()
    for y in range(h):
        for x in range(w):
            if cpx[x,y]==MARKER: apx[x,y]=0
    if fringe:
        g=a.filter(ImageFilter.MaxFilter(fringe*2+1)).load()
        for y in range(h):
            for x in range(w):
                if apx[x,y] and g[x,y]<255:
                    r,gg,b=spx[x,y]
                    if r>=white_cut-fringe*4 and gg>=white_cut-fringe*4 and b>=white_cut-fringe*4:
                        apx[x,y]=0
    im=src.convert("RGBA"); im.putalpha(a); return im
CLUBS=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"public","assets","clubs")
todo=["elite-fighting-force-vfc","kita-kita-vfc","onxon-og","pase-magico-vfc","penangmariii-vfc","reunion-vfc","sobat-vfc","total-23"]
for n in todo:
    p=os.path.join(CLUBS,n+".png")
    if not os.path.exists(p): print("miss",n); continue
    im=make(p)
    im.save(p,"PNG",optimize=True)
    print(f"  reprocessed {n}.png {im.size} {os.path.getsize(p)//1024}KB")
