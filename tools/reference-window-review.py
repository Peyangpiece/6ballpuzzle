"""Inspect source windows, including achromatic game-over ball trajectories."""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image,ImageDraw

p=argparse.ArgumentParser();p.add_argument('--clip',type=int,required=True);p.add_argument('--start',type=int,required=True)
p.add_argument('--end',type=int,required=True);p.add_argument('--step',type=int,default=5);p.add_argument('--side',type=int,default=0)
p.add_argument('--out',default='audit-results/reference-full-2026-10-02');args=p.parse_args()
out=Path(args.out);manifest=json.loads((out/'manifest.json').read_text());m=manifest[args.clip]
cap=cv2.VideoCapture(str(Path('/Users/oyahiroki/Downloads')/m['source']));tiles=[];frames=[]
x0=[245,1005][args.side]
for n in range(args.start,args.end+1,args.step):
    cap.set(cv2.CAP_PROP_POS_FRAMES,n);ok,bgr=cap.read()
    if not ok:raise RuntimeError(f'Missing frame {n}')
    crop=bgr[230:925,x0:x0+670];gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)
    circles=cv2.HoughCircles(gray,cv2.HOUGH_GRADIENT,dp=1,minDist=45,param1=100,param2=23,minRadius=26,maxRadius=35)
    detected=[]
    if circles is not None:
        hsv=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)
        for x,y,r in circles[0]:
            ix,iy=int(x),int(y);roi=hsv[max(0,iy-14):iy+15,max(0,ix-14):ix+15]
            if roi.size==0:continue
            detected.append({'x':round(float(x+x0),1),'y':round(float(y+230),1),'r':round(float(r),1),
                'saturation':round(float(np.median(roi[:,:,1])),1),'value':round(float(np.median(roi[:,:,2])),1)})
    frames.append({'frame':n,'circles':detected})
    rgb=Image.fromarray(cv2.cvtColor(crop,cv2.COLOR_BGR2RGB));rgb.thumbnail((335,348))
    tile=Image.new('RGB',(335,372),'#151515');tile.paste(rgb,(0,24));ImageDraw.Draw(tile).text((5,5),f'C{args.clip} S{args.side} F{n}',fill='white');tiles.append(tile)
sheet=Image.new('RGB',(335*4,372*((len(tiles)+3)//4)),'black')
for i,t in enumerate(tiles):sheet.paste(t,((i%4)*335,(i//4)*372))
stem=f'clip{args.clip}-side{args.side}-{args.start}-{args.end}'
sheet.save(out/(stem+'.jpg'),quality=95);(out/(stem+'.json')).write_text(json.dumps(frames,indent=2)+'\n')
cap.release();print(stem)
