"""Extract reference footage and reproducible per-frame ball measurements."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw

FILES = [
    "20260814-01KZY859WCA6E05B8W8KVXV08J-F7FDFCD7-C1D0-4B86-BB37-69ECBCBB54A8.mp4",
    "20260814-01KZY8BWFNHVZZ5BF80ERVQGJ1-6A3B5C4B-FBDF-4B10-8E92-93112D279793.mp4",
    "20260814-01KZY8HMCZ13A6JT55BAQRAW1S-0C80C14A-9296-46EA-A240-FDF9DB68923A.mp4",
    "20260814-01KZY8JCG2T23AE4A41AKS6268-A42695F2-7126-4770-9797-0A2C3BD44C09.mp4",
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="/Users/oyahiroki/Downloads")
    parser.add_argument("--out", default="audit-results/reference-motion-2026-10-02")
    parser.add_argument("--clip", type=int)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int)
    parser.add_argument("--step", type=int, default=30)
    parser.add_argument("--width", type=int, default=480)
    parser.add_argument("--circles", action="store_true")
    args = parser.parse_args()
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    clips = range(len(FILES)) if args.clip is None else [args.clip]
    metadata = []
    for i in clips:
        source = Path(args.source) / FILES[i]
        cap = cv2.VideoCapture(str(source))
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open reference: {source}")
        fps = cap.get(cv2.CAP_PROP_FPS)
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        tiles = []
        measurements = []
        stop = min(frames, args.end + 1) if args.end is not None else frames
        for frame in range(args.start, stop, args.step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame)
            ok, bgr = cap.read()
            if not ok:
                raise RuntimeError(f"Cannot decode clip {i} frame {frame}")
            rgb = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            if args.circles:
                gray=cv2.cvtColor(bgr,cv2.COLOR_BGR2GRAY)
                circles=cv2.HoughCircles(gray,cv2.HOUGH_GRADIENT,dp=1,minDist=46,
                    param1=100,param2=24,minRadius=26,maxRadius=35)
                detected=[]
                if circles is not None:
                    for x,y,r in circles[0]:
                        if not ((250<x<915 or 1005<x<1675) and 25<y<900):
                            continue
                        hsv=cv2.cvtColor(bgr,cv2.COLOR_BGR2HSV)
                        yy,xx=np.ogrid[:bgr.shape[0],:bgr.shape[1]]
                        mask=((xx-x)**2+(yy-y)**2<(r*.72)**2)&(hsv[:,:,1]>90)&(hsv[:,:,2]>90)
                        hues=hsv[:,:,0][mask]
                        if len(hues)<50:
                            continue
                        hue=float(np.median(hues))
                        color="red" if hue<12 or hue>160 else "yellow" if hue<38 else "green" if hue<90 else "blue" if hue<132 else "purple"
                        detected.append({"x":round(float(x),2),"y":round(float(y),2),"r":round(float(r),2),"hue":hue,"color":color})
                measurements.append({"frame":frame,"time":frame/fps,"circles":detected})
            rgb.thumbnail((args.width, args.width * 9 // 16))
            tile = Image.new("RGB", (args.width, args.width * 9 // 16 + 24), "#161616")
            tile.paste(rgb, (0, 24))
            ImageDraw.Draw(tile).text((8, 5), f"clip {i} F{frame} {frame/fps:.3f}s", fill="white")
            tiles.append(tile)
            if args.step == 1:
                Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).save(output / f"clip{i}-f{frame:04}.png")
        columns = 4
        rows = (len(tiles) + columns - 1) // columns
        sheet = Image.new("RGB", (columns * args.width, rows * tiles[0].height), "black")
        for n, tile in enumerate(tiles):
            sheet.paste(tile, ((n % columns) * args.width, (n // columns) * tile.height))
        name = f"clip{i}-{args.start}-{stop-1}-step{args.step}.jpg"
        sheet.save(output / name, quality=92)
        metadata.append({"file": str(source), "fps": fps, "frames": frames, "sheet": name})
        if args.circles:
            (output/f"clip{i}-circles-{args.start}-{stop-1}.json").write_text(json.dumps(measurements,indent=2)+"\n")
        cap.release()
    (output / "extraction.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))

if __name__ == "__main__":
    main()
