"""Sequential, all-frame measurements. Detections are evidence, not parity claims."""
import argparse
import hashlib
import json
import runpy
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
FILES=runpy.run_path(str(Path(__file__).with_name('reference-motion-analysis.py')))['FILES']


def centres(bgr, x0):
    crop=bgr[20:905,x0:x0+670]
    gray=cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY)
    circles=cv2.HoughCircles(gray,cv2.HOUGH_GRADIENT,dp=1,minDist=45,
        param1=100,param2=23,minRadius=26,maxRadius=35)
    result=[]
    if circles is None:return result
    hsv=cv2.cvtColor(crop,cv2.COLOR_BGR2HSV)
    for x,y,r in circles[0]:
        ix,iy=int(x),int(y);n=int(r*.7)
        xa,xb=max(0,ix-n),min(crop.shape[1],ix+n+1)
        ya,yb=max(0,iy-n),min(crop.shape[0],iy+n+1)
        roi=hsv[ya:yb,xa:xb];yy,xx=np.ogrid[ya:yb,xa:xb]
        mask=((xx-x)**2+(yy-y)**2<(r*.7)**2)&(roi[:,:,1]>90)&(roi[:,:,2]>95)
        hues=roi[:,:,0][mask]
        if len(hues)<max(100,np.pi*(r*.7)**2*.35):continue
        hue=float(np.median(hues))
        color='red' if hue<12 or hue>160 else 'yellow' if hue<38 else 'green' if hue<90 else 'blue' if hue<132 else 'purple'
        result.append({'x':round(float(x+x0),1),'y':round(float(y+20),1),'r':round(float(r),1),'hue':hue,'color':color})
    return result


def changes(before,after):
    pairs=[]
    for i,a in enumerate(before):
        for j,b in enumerate(after):
            if a['color']!=b['color']:continue
            d=float(np.hypot(a['x']-b['x'],a['y']-b['y']))
            if d<65:pairs.append((d,i,j))
    useda,usedb=set(),set();moves=[]
    for d,i,j in sorted(pairs):
        if i in useda or j in usedb:continue
        useda.add(i);usedb.add(j)
        if after[j]['y']>400 and d>7:
            moves.append({'from':before[i],'to':after[j],'distance':round(d,2)})
    return moves


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',default='/Users/oyahiroki/Downloads')
    p.add_argument('--out',default='audit-results/reference-full-2026-10-02');args=p.parse_args()
    out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    files=FILES+['20260814-01KZY8MSZ2RXFE9EG6MBEA382N-8F028AFD-9829-4EDC-A36C-7BD532B11D85.mp4',
        '20260814-01KZY8PZF49A2D5YJSP88J8GZ0-EA113C87-B23F-4DD9-9286-3A6F18930280.mp4']
    manifest=[]
    for clip,name in enumerate(files):
        source=Path(args.source)/name;cap=cv2.VideoCapture(str(source))
        if not cap.isOpened():raise RuntimeError(f'Cannot open {source}')
        fps=cap.get(cv2.CAP_PROP_FPS);expected=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        samples=[];previous=[[],[]];events=[];tiles=[];n=0
        while True:
            ok,bgr=cap.read()
            if not ok:break
            sides=[centres(bgr,245),centres(bgr,1005)]
            moving=[changes(previous[s],sides[s]) for s in range(2)]
            if any(moving):events.append({'frame':n,'moves':moving})
            samples.append({'frame':n,'time':n/fps,'sides':sides})
            previous=sides
            if n%30==0:
                rgb=Image.fromarray(cv2.cvtColor(bgr,cv2.COLOR_BGR2RGB));rgb.thumbnail((480,270))
                tile=Image.new('RGB',(480,294),'#151515');tile.paste(rgb,(0,24))
                ImageDraw.Draw(tile).text((5,5),f'C{clip} F{n} {n/fps:.3f}s',fill='white');tiles.append(tile)
            n+=1
            if n%120==0:print(f'clip {clip}: {n}/{expected}',flush=True)
        cap.release()
        if n!=expected:raise RuntimeError(f'Decode coverage {n}/{expected} for {source}')
        windows=[]
        for e in events:
            if windows and e['frame']<=windows[-1]['end']+8:windows[-1]['end']=e['frame']
            else:windows.append({'start':max(0,e['frame']-2),'end':e['frame']})
        for w in windows:w['end']=min(n-1,w['end']+8)
        sheet=Image.new('RGB',(1920,294*((len(tiles)+3)//4)),'black')
        for k,tile in enumerate(tiles):sheet.paste(tile,((k%4)*480,(k//4)*294))
        sheet.save(out/f'clip{clip}-overview.jpg',quality=92)
        (out/f'clip{clip}-frames.json').write_text(json.dumps(samples,separators=(',',':'))+'\n')
        (out/f'clip{clip}-events.json').write_text(json.dumps({'windows':windows,'events':events},indent=2)+'\n')
        meta={'clip':clip,'source':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'fps':fps,'decodedFrames':n,'expectedFrames':expected,'motionWindows':windows,
            'status':'all frames measured; not yet reconstructed or compared to engine'}
        manifest.append(meta);(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        print(json.dumps(meta),flush=True)


if __name__=='__main__':main()
